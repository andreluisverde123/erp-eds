# Bifurcação: ERP da EDS × plataforma SaaS

Análise da arquitetura atual, classificação de tudo que existe e plano técnico
de separação. Nenhum código foi alterado para produzir este documento.

Base analisada: 688 arquivos versionados, 30 models, 42 services, 40
controllers, 23 migrations, 31 componentes de UI, 16 permissões.

---

## Conclusão antes da análise

**Não existe uma bifurcação a fazer: a plataforma já é multi-tenant.** O que
existe hoje é uma plataforma SaaS na qual a EDS é o primeiro inquilino, não um
sistema da EDS que precisa ser generalizado.

As evidências são estruturais, não interpretativas:

| Evidência                                                                                                                                                                                  | Onde                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `Company` tem `slug`, `status` (ACTIVE/TRIAL/SUSPENDED/CANCELLED), `plan` (STARTER/PROFESSIONAL/ENTERPRISE), `timezone`, `locale`, `currency`, `logoUrl`, `primaryColor`, `secondaryColor` | `schema.prisma:149`                       |
| Cadastro self-service funcionando: cria empresa + 6 papéis + admin em uma transação e já devolve sessão                                                                                    | `src/onboarding/`                         |
| 40 dos 42 services filtram por `companyId`; os 2 que não filtram são o catálogo global de permissões e o `PrismaService`                                                                   | `src/**/**.service.ts`                    |
| Existe teste automatizado de vazamento entre inquilinos                                                                                                                                    | `scripts/tenant-isolation-check.ts`       |
| A cor primária do produto é `#db027d` (rosa OManager); o vermelho `#ED2124` da EDS aparece só no logo do inquilino                                                                         | `globals.css:21`, `logo-eds.svg`          |
| A marca do produto no menu já é **OManager**, e a EDS aparece no rodapé como "Construtora"                                                                                                 | `sidebar-brand.tsx`, `sidebar-footer.tsx` |

Ou seja: a separação conceitual entre **produto** e **cliente do produto** já
foi feita no design. O que falta não é separar — é **terminar o lado SaaS** e
**parar de tratar a EDS como conteúdo do código**.

Copiar o repositório em dois duplicaria ~98% dos arquivos para isolar cerca de
dez artefatos, todos de dado ou configuração. A partir do segundo mês, cada
correção de bug precisaria ser aplicada duas vezes, e as duas bases divergiriam.
A recomendação está na seção final; a classificação completa vem antes, porque
foi o que você pediu e é ela que sustenta a recomendação.

---

## Classificação

### Compartilhado

Tudo abaixo serve aos dois produtos sem uma linha de diferença.

**Banco (30 models, 23 migrations).** Todo o modelo de domínio é genérico de
construtora: `ConstructionSite`, `CostCenter`, `Supplier`, `PurchaseRequest`,
`PurchaseRequestItem`, `PurchaseOrder`, `Invoice`, `AccountPayable`, `Payment`,
`Employee`, `EmployeeAllocation`, `TimeEntry`, `ProductionEntry`, `Payslip`,
`Contractor`, `ContractorContract`, `ContractDocument`, `ContractEmployee`,
`Attachment`, `AuditLog`, `WorkflowComment`, `NotificationPreference`. Nenhum
campo, enum ou constraint carrega regra da EDS. Todos têm `companyId`.

**Módulos de negócio (API).** `engenharia`, `compras`, `financeiro`, `rh`,
`terceiros`, `relatorios`, `workflow`, `search`, `trash`, `attachments`,
`files`, `storage`, `configuracoes`, `auth`, `onboarding`, `health`.

**Regras de negócio.** Todas genéricas e, quando parametrizáveis, já
parametrizadas por empresa:

- Máquina de estados da solicitação (DRAFT → PENDING → QUOTING → APPROVED, com
  CANCELLED terminal)
- Separação entre pedir (`compras.request`) e comprar (`compras.manage`)
- Alçada de aprovação por valor, com limite em `SystemSettings` por empresa
- Soft delete com embaralhamento de código único e restauração pela Lixeira
- Código sequencial por empresa (`SOL-0001`, `OC-0001`)
- Auditoria automática via extensão do Prisma
- Cálculo de vigência/vencimento de contrato de terceirizado

**Permissões.** As 16 permissões e os 6 papéis-modelo (Administrador,
Engenharia, Compras, Financeiro, RH, Diretoria) descrevem funções de qualquer
construtora, não cargos da EDS. Importante: `Permission.code` é **globalmente
único** — o catálogo é do produto; os papéis é que são por empresa
(`Role.companyId`). Esse desenho está correto para SaaS e não deve mudar.

**Design system.** `packages/ui` inteiro (31 componentes), `globals.css` com os
tokens, e a cor primária `#db027d`, que é do produto (OManager) e não da EDS.

**Componentes e telas do web.** As 13 features e todas as páginas. Nenhuma tela
existe por causa da EDS.

**Ferramental.** `packages/tsconfig`, `packages/eslint-config`, `packages/types`,
`turbo.json`, CI, husky/lint-staged, `docker/api.Dockerfile`,
`docker/web.Dockerfile`, `docker/nginx.conf`, `docker-compose.prod.yml`.

**Integrações.** Postgres/Prisma, storage (driver `local` e `s3` compatível com
AWS/MinIO/R2/Supabase), exportação xlsx/pdf, JWT, throttler, helmet. Nenhuma é
específica de cliente.

### Exclusivo da EDS

Dez artefatos, e **nenhum deles é regra de negócio** — são dado, marca e
infraestrutura de demonstração.

| Artefato                                                                                                                                                | Onde                                                  | Natureza            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- |
| Dados de demonstração: empresa "EDS Construtora Demo Ltda.", 6 usuários `@eds.app`, obras OBR-001/002/003, centros de custo, solicitações, fornecedores | `prisma/seed.ts`                                      | dado                |
| Logo da construtora                                                                                                                                     | `public/logo-eds.svg`                                 | marca do inquilino  |
| Rodapé fixo "Construtora / EDS" com o logo embutido                                                                                                     | `sidebar-footer.tsx:20-23`                            | marca **hardcoded** |
| Título da aba do navegador                                                                                                                              | `index.html:7`                                        | marca hardcoded     |
| "Acesse o ERP EDS com suas credenciais."                                                                                                                | `login-page.tsx:72`                                   | marca hardcoded     |
| "Obras na EDS"                                                                                                                                          | `obras-home-section.tsx:15`                           | marca hardcoded     |
| `alt="EDS"` em quatro logos do produto                                                                                                                  | brand, login, cadastro, trocar-senha                  | marca hardcoded     |
| Padrão `erpName` = `'EDS'`                                                                                                                              | `schema.prisma:976`                                   | configuração        |
| Gerador do .docx de acessos da demonstração                                                                                                             | `scripts/gerar-doc-acessos.py`                        | operação            |
| Stack de demonstração com túnel Cloudflare                                                                                                              | `docker-compose.prod.yml` (serviço `tunnel`), runbook | operação            |

Os quatro itens marcados como _hardcoded_ são o único acoplamento real de marca
no código. Todos têm o campo correspondente já existente no banco
(`Company.logoUrl`, `Company.tradeName`, `SystemSettings.erpName`) — o dado
existe, a interface é que o ignora.

### Exclusivo do SaaS

Nada disto existe hoje. É a lista do que precisa ser **construído**, não
separado.

| #   | Item                                         | Estado atual                                                                                                                                                                                                                                      |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Marca em tempo de execução (white-label)** | `logoUrl`, `primaryColor`, `secondaryColor` e `erpName` são gravados e editáveis em Configurações, mas **nenhum deles é aplicado à interface**. Todo tenant vê o logo OManager e o rosa `#db027d`.                                                |
| S2  | **Cobrança e assinatura**                    | Zero código. Busca por billing/subscription/stripe/gateway não retorna nada.                                                                                                                                                                      |
| S3  | **Limites e recursos por plano**             | `TenantPlan` é gravado no cadastro (`STARTER`) e **nunca lido em lugar nenhum**. Não há limite de usuários, obras ou armazenamento.                                                                                                               |
| S4  | **Back-office da plataforma**                | Não existe. `SUPER_ADMIN` está no enum `UserRoleType` e aparece num seletor da tela de papéis, mas **nenhuma linha de código concede acesso entre empresas**. Não há como listar tenants, suspender, ver uso ou entrar como cliente para suporte. |
| S5  | **Ciclo de vida do trial**                   | `TenantStatus.TRIAL` existe e o login respeita `SUSPENDED`/`CANCELLED`, mas nada expira trial nem cobra.                                                                                                                                          |
| S6  | **Verificação de e-mail no cadastro**        | O cadastro cria a empresa e entra direto. Sem confirmação de e-mail, qualquer endereço inventado vira tenant.                                                                                                                                     |
| S7  | **Domínio por tenant**                       | Não há resolução por subdomínio nem por caminho. O tenant sai do JWT.                                                                                                                                                                             |
| S8  | **Site institucional e captação**            | Não existe. A raiz do app é a tela de login.                                                                                                                                                                                                      |
| S9  | **LGPD por tenant**                          | Não há exportação nem exclusão dos dados de uma empresa. Em SaaS isso é obrigação legal, não recurso.                                                                                                                                             |
| S10 | **Métricas de uso e cobrança por consumo**   | `AuditLog` cresce sem retenção e não há telemetria por tenant.                                                                                                                                                                                    |

---

## Riscos identificados na análise

Pontos que hoje não incomodam com um único cliente e viram problema no momento
em que existir o segundo.

1. **Storage local não sobrevive a duas réplicas.** Com `STORAGE_DRIVER=local`
   o arquivo enviado numa instância não existe na outra. O driver S3 já está
   pronto e testado; é decisão de configuração, não de código.
2. **Throttling é global, não por tenant.** Um cliente sozinho pode consumir o
   limite de todos.
3. **`AuditLog` sem particionamento nem retenção**, compartilhado por todos os
   inquilinos na mesma tabela.
4. **Sem cabeçalho de tenant nos logs.** Investigar incidente de um cliente
   específico hoje exige garimpar por `companyId` no corpo das requisições.
5. **`SUPER_ADMIN` é uma armadilha.** Está exposto no seletor de papéis da
   interface, sugerindo poder que não existe. Um administrador de tenant pode
   criar um papel com esse tipo achando que ganha alcance de plataforma.
6. **Anexos herdam a permissão do módulo dono.** Já produziu um descasamento
   real (o engenheiro abre solicitação mas não anexa arquivo). Em SaaS,
   multiplicado por cliente, vira volume de suporte.

---

## Plano técnico de separação

### Recomendado: um código, duas implantações

A separação acontece no **deploy e no dado**, nunca no código-fonte. A EDS deixa
de ser conteúdo do repositório e passa a ser o que sempre foi na modelagem: um
registro na tabela `Company`.

```
                    repositório único (este)
                              │
              ┌───────────────┴───────────────┐
              │                               │
      implantação EDS                 implantação SaaS
   banco próprio, 1 tenant        banco próprio, N tenants
   domínio da EDS                 domínio da plataforma
   cadastro público desligado     cadastro público ligado
```

**Fase A — Descolar a marca do código** (P, ~2 dias, sem migration)

- A1. Expor `tradeName`, `logoUrl` e `erpName` no `AuthUser`, para o front ter o
  que exibir. Já é o item 8.2 do `plano-evolucoes.md`.
- A2. Trocar as quatro marcas fixas por dado do tenant: rodapé da sidebar,
  título da aba, texto do login, "Obras na EDS" → "Obras".
- A3. Aplicar `primaryColor`/`secondaryColor` como variáveis CSS em tempo de
  execução, com o rosa do produto como padrão.
- A4. `SystemSettings.erpName` deixa de ter `'EDS'` como padrão.
- A5. Mover `logo-eds.svg` para dentro do banco (`Company.logoUrl`) e removê-lo
  do repositório. O carregador de logo já existe.

Ao fim desta fase o repositório não contém mais nenhuma marca da EDS, e o
sistema exibe a marca de quem estiver logado. **Esta fase sozinha entrega 90% da
"bifurcação" pedida.**

**Fase B — Separar seed de demonstração de seed de produto** (P, ~1 dia)

- B1. Quebrar `seed.ts` em duas partes: **catálogo** (permissões e papéis-modelo,
  necessário em toda instalação) e **demonstração** (empresa EDS, usuários
  `@eds.app`, obras e solicitações de exemplo).
- B2. A parte de demonstração só roda com `SEED_DEMO=true`. Produção nunca a
  executa. Isso elimina de vez o risco de a senha `Eds@12345` chegar num
  ambiente publicado.
- B3. Mover `scripts/gerar-doc-acessos.py` e o runbook do túnel para
  `docs/demo/` — são ferramentas de demonstração, não do produto.

**Fase C — Separar as implantações** (M, ~3 dias)

- C1. Dois bancos, dois conjuntos de segredos, dois jobs de deploy no CI. Já
  está no seu plano de prioridades (Bloco 1.1).
- C2. Uma variável `PUBLIC_SIGNUP_ENABLED` desliga o cadastro self-service na
  implantação da EDS. É uma linha de guarda no `OnboardingController`.
- C3. A EDS é criada por seed de provisionamento (uma empresa, um admin), não
  pelo seed de demonstração.

**Fase D — Construir o que só o SaaS precisa** (G, semanas)

Na ordem em que uma coisa destrava a outra:

1. **S6 — verificação de e-mail** (depende do módulo de e-mail, item 5.1 do
   plano de evoluções, que hoje está pela metade). Sem isso o cadastro público
   não pode ser aberto.
2. **S4 — back-office da plataforma**: listar tenants, suspender, ver uso.
   Antes disso, remover `SUPER_ADMIN` do seletor de papéis para não prometer o
   que não existe.
3. **S3 — limites por plano**, lendo `TenantPlan`, que já está gravado.
4. **S2/S5 — cobrança e ciclo de trial**.
5. **S9 — exportação e exclusão de dados** por tenant.
6. **S7/S8 — subdomínio e site institucional.**

**Fase E — Endurecer para multi-inquilino** (M)

Storage S3 obrigatório · throttling por tenant · `companyId` nos logs ·
retenção de `AuditLog` · limites de upload por plano.

### Alternativa: dois repositórios de verdade

Se ainda assim a decisão for separar as bases, o caminho honesto é:

1. Executar as fases A e B primeiro **de qualquer forma** — sem elas você
   duplicaria a marca da EDS dentro do produto SaaS.
2. `saas` nasce como o repositório atual; `eds` nasce como um fork marcado com
   a tag do dia da separação.
3. Definir desde o primeiro dia qual é o **sentido do fluxo**: correções nascem
   no SaaS e são portadas para a EDS, nunca o contrário. Sem essa regra as
   bases divergem em semanas.
4. Aceitar o custo: hoje, toda correção passa a ser feita duas vezes, e o
   `packages/ui` teria que virar pacote publicado para não ser copiado.

O custo real dessa alternativa não é o dia da separação — é o segundo mês.

---

## Resumo em uma tabela

| Categoria      | Volume                | Observação                                                                        |
| -------------- | --------------------- | --------------------------------------------------------------------------------- |
| Compartilhado  | ~98% dos 688 arquivos | Todo o domínio, permissões, design system, ferramental                            |
| Exclusivo EDS  | 10 artefatos          | Dado de seed, logo, 4 textos fixos, 2 itens de operação. Nenhuma regra de negócio |
| Exclusivo SaaS | 10 itens              | Nada existe: cobrança, planos, back-office, white-label, trial, LGPD              |

O trabalho de "separar" é pequeno (fases A a C, ~1 semana). O trabalho de "ter
dois produtos" é grande, e está inteiro do lado do SaaS — que ainda não tem
cobrança, plano, back-office nem marca própria por cliente.

---

## Decisões que dependem de você

1. **Fork real ou uma base com duas implantações?** A análise recomenda a
   segunda; a primeira só se houver motivo comercial ou contratual que a
   arquitetura não revela.
2. **A EDS continua sendo um inquilino da plataforma ou vira instalação
   dedicada?** Muda a Fase C, não as fases A e B.
3. **"OManager" é o nome do SaaS?** A marca já está no menu, no login e no
   cadastro. Se for, a Fase A fica mais simples — é só parar de chamar de EDS o
   que já é OManager.
