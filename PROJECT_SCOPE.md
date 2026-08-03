# ERP EDS — Escopo do Projeto

Sistema de gestão **proprietário da construtora EDS**. Não é produto vendido,
não é plataforma, não tem assinatura e não hospeda outras construtoras.

Este documento define o que o projeto é, o que ele não é, e a régua para
decidir se uma mudança futura pertence a ele.

---

## 1. Objetivo

Dar à EDS um sistema único onde o ciclo de uma obra acontece de ponta a ponta:
a obra é cadastrada, o material é solicitado, comprado, recebido em nota, pago,
e a mão de obra — própria e terceirizada — é registrada contra a mesma obra.

O ganho não está em nenhum módulo isolado, e sim na costura entre eles: a
solicitação vira ordem de compra, a ordem vira nota fiscal, a nota vira conta a
pagar, e tudo aponta para uma obra e um centro de custo. Cada peça é
rastreável até a origem.

**O que o sistema resolve**

| Problema                                                     | Onde                      |
| ------------------------------------------------------------ | ------------------------- |
| Pedido de material sem registro e sem alçada                 | Engenharia → Solicitações |
| Compra sem vínculo com obra ou centro de custo               | Compras                   |
| Nota fiscal e pagamento desconectados da compra que os gerou | Financeiro                |
| Ponto e produção sem alocação por obra                       | RH                        |
| Contrato de terceirizado vencendo sem ninguém perceber       | Terceirizados             |
| "Quem alterou isso?" sem resposta                            | Auditoria (Configurações) |
| Exclusão acidental sem volta                                 | Lixeira (Configurações)   |

---

## 2. Visão do produto

O sistema é **interno**. Quem usa é funcionário da EDS, com acesso concedido
por um administrador. Não há página pública, não há captação, não há
auto-cadastro, não há indexação em buscador.

Três consequências que valem para toda decisão futura:

1. **Uma empresa, para sempre.** A EDS não é "o primeiro cliente". É a única.
   Não existe segunda construtora prevista, e nenhuma decisão de projeto deve
   ser tomada para acomodar uma.
2. **Especificidade é permitida.** Se a EDS trabalha de um jeito, o sistema
   trabalha desse jeito. Não há obrigação de generalizar, parametrizar ou
   tornar configurável o que é regra fixa da casa.
3. **A régua de uma funcionalidade é o uso real.** A pergunta que aprova uma
   mudança é "alguém na EDS precisa disso para trabalhar?", não "isso deixa o
   sistema mais completo?".

---

## 3. Escopo

### Dentro

- Engenharia: obras e centros de custo
- Compras: solicitações, cotação, ordens de compra, fornecedores
- Financeiro: notas fiscais, contas a pagar, pagamentos
- RH: funcionários, alocação por obra, ponto, produção, holerites
- Terceirizados: empresas, contratos, documentos, funcionários vinculados
- Relatórios e exportação (xlsx/pdf)
- Processos: comentários, histórico e anexos transversais aos módulos
- Busca global
- Configurações: usuários, papéis, empresa, sistema, notificações, auditoria, lixeira

### Fora

Não faz parte do projeto e não deve ser proposto sem decisão explícita da EDS:

- Cobrança, assinatura, planos ou limite de uso
- Back-office de plataforma, administração entre empresas, suporte "entrar como cliente"
- Cadastro público, verificação de e-mail de cadastro, ciclo de trial
- Site institucional, landing page, material de captação
- Marca configurável por cliente (white-label)
- Domínio ou subdomínio por empresa
- App móvel nativo
- Integração contábil/fiscal (SPED, NF-e), folha de pagamento calculada,
  orçamento de obra e cronograma físico-financeiro — nenhum é escopo hoje;
  todos são candidatos legítimos a evolução futura se a EDS precisar.

### Limitações conhecidas

Coisas que o sistema **não** faz hoje, e que valem saber antes de prometer:

| Limitação                                                                          | Impacto                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Notificação só existe como preferência gravada; nenhum envio real acontece         | Nada é disparado por e-mail, WhatsApp ou push                              |
| Holerite é documento anexado, não folha calculada                                  | O cálculo continua fora do sistema                                         |
| Aprovação de compra é de um nível só (alçada por valor), sem cadeia de aprovadores | Fluxos com dois ou três níveis exigiriam mudança                           |
| Código sequencial (`SOL-0001`) usa `count()` e tem janela de corrida teórica       | Aceitável fora de documento fiscal; trocar por sequence se virar requisito |
| `STORAGE_DRIVER=local` não sobrevive a duas réplicas da API                        | Deploy com réplica exige `s3`                                              |
| A cobertura de teste automatizado é mínima (uma suíte trivial)                     | Regressão depende de teste manual                                          |
| Sem retenção nem particionamento em `AuditLog`                                     | A tabela cresce sem limite                                                 |

---

## 4. Arquitetura

Monorepo com Turborepo e npm workspaces. Duas aplicações, quatro pacotes
compartilhados.

```
erp-eds/
├── apps/
│   ├── api/          NestJS 11 + Prisma 7 + PostgreSQL
│   └── web/          React 19 + Vite + React Router + TanStack Query
├── packages/
│   ├── types/        contratos compartilhados + identidade da EDS
│   ├── ui/           design system (31 componentes)
│   ├── tsconfig/     presets de TypeScript
│   └── eslint-config/presets de lint
├── docker/           imagens e compose de produção
└── docs/             arquitetura, deploy, banco
```

### Fluxo de uma requisição

```
navegador
   │  fetch com Bearer token (apiClient)
   ▼
nginx ──/api──▶ NestJS
                  │
                  ├─ JwtAuthGuard          sessão válida?
                  ├─ PasswordChangeGuard   senha temporária pendente?
                  ├─ RolesGuard            papel exigido pela rota
                  ├─ PermissionsGuard      permissão exigida pela rota
                  ▼
               Controller ─▶ Service ─▶ PrismaService ─▶ PostgreSQL
                                             │
                                             └─ extensão de auditoria
```

Os quatro guards são globais. Uma rota sem decoration exige apenas sessão
válida; `@Public()` a libera; `@RequirePermissions(...)` e `@Roles(...)`
somam exigências.

### Autenticação

Access token JWT de 15 minutos no cabeçalho `Authorization`, refresh token de
7 dias em cookie `httpOnly`. O refresh acontece de forma transparente no
`apiClient` do front. Senha definida por administrador nasce temporária e
bloqueia toda a API até a troca (`PasswordChangeGuard`).

### Arquivos

Nada é servido estaticamente. Holerite, documento de contrato, logo e anexo
passam pelo `FilesModule`, que exige o mesmo JWT e a mesma permissão de módulo
que protege o registro dono do arquivo. `STORAGE_DRIVER` escolhe entre disco
local e S3 (AWS, MinIO, R2, Supabase) sem mudar o código de chamada.

### Multi-tenant — nota importante

O banco continua modelado com `companyId` em todas as tabelas, e os services
continuam filtrando por ele. **Isso é decisão de manutenção, não conceito
funcional.** O isolamento existente é uma defesa em profundidade barata e
testada; desmontá-lo custaria uma migração grande sem entregar nada ao usuário.

O que mudou é que a aplicação **assume uma empresa só**. Multi-tenant não
aparece na interface, não é vendido como recurso e não deve orientar decisão de
produto. Concretamente:

- O auto-cadastro está desligado (`PUBLIC_SIGNUP_ENABLED=false`)
- `SUPER_ADMIN` saiu do seletor de papéis: nunca concedeu alcance entre
  empresas e prometia poder inexistente
- Não há tela de troca de empresa, listagem de empresas ou administração de
  plataforma

Ao evoluir um service, mantenha o filtro por `companyId`. Ele é barato e a
verificação automatizada (`scripts/scoped-where-check.ts`) depende dele.

---

## 5. Stack

| Camada     | Escolha                                            |
| ---------- | -------------------------------------------------- |
| Linguagem  | TypeScript 6 (estrito nas duas pontas)             |
| API        | NestJS 11, Passport JWT, class-validator, Joi      |
| Banco      | PostgreSQL 16+ via Prisma 7 (`pg_trgm` para busca) |
| Front      | React 19, Vite 8, React Router 8, TanStack Query 5 |
| Formulário | react-hook-form + Zod                              |
| Estilo     | Tailwind 4 + design system próprio (`packages/ui`) |
| Gráfico    | Recharts                                           |
| Exportação | exceljs (xlsx), pdfkit (pdf)                       |
| Log        | pino (JSON em produção)                            |
| Build      | Turborepo, npm workspaces                          |
| Deploy     | Docker + nginx                                     |

---

## 6. Módulos

| Módulo        | API                 | Web                      | Permissões                                                 |
| ------------- | ------------------- | ------------------------ | ---------------------------------------------------------- |
| Engenharia    | `src/engenharia`    | `features/engenharia`    | `engenharia.view` / `.manage`                              |
| Compras       | `src/compras`       | `features/compras`       | `compras.view` / `.request` / `.manage` / `.approve`       |
| Financeiro    | `src/financeiro`    | `features/financeiro`    | `financeiro.view` / `.manage` / `.approve`                 |
| RH            | `src/rh`            | `features/rh`            | `rh.view` / `.manage`                                      |
| Terceirizados | `src/terceiros`     | `features/terceiros`     | `terceiros.view` / `.manage`                               |
| Relatórios    | `src/relatorios`    | `features/relatorios`    | `relatorios.view`                                          |
| Processos     | `src/workflow`      | `features/workflow`      | `dashboard.view` + permissão do módulo do registro         |
| Busca         | `src/search`        | `features/search`        | `dashboard.view` + permissão do módulo do resultado        |
| Anexos        | `src/attachments`   | `features/anexos`        | permissão do módulo dono do registro                       |
| Lixeira       | `src/trash`         | `features/lixeira`       | `<módulo>.view` para ver, `<módulo>.manage` para restaurar |
| Configurações | `src/configuracoes` | `features/configuracoes` | `admin.manage_users`                                       |
| Autenticação  | `src/auth`          | `features/auth`          | pública                                                    |

Cada módulo da API segue a mesma forma: `module.ts`, `controller.ts`,
`service.ts`, `dto/`. Cada feature do web segue: `hooks/`, `components/`,
`api.ts`, `schemas.ts`.

---

## 7. Convenções

### Identidade

Nome, logo, dados cadastrais e cores da EDS vivem em **um lugar só**:
`EDS_COMPANY`, em `packages/types/src/company.ts`. A API e o web leem a mesma
constante.

Nunca escreva "EDS" direto em componente, página ou service. Se um texto
precisa do nome da empresa, ele vem daí.

Duas exceções, ambas intencionais:

- `index.html` e `manifest.webmanifest` repetem os valores literalmente —
  são servidos antes de qualquer JavaScript.
- `globals.css` repete o vermelho `#ED2124` — é CSS, não lê TypeScript. Os
  dois andam juntos.

### Permissões

- Todo endpoint que lê exige `<módulo>.view`; todo endpoint que escreve exige
  `<módulo>.manage`. Sem exceção silenciosa.
- `Permission.code` é único no banco inteiro; `Role` é por empresa.
- A checagem no front (`config/nav.ts`, `RequirePermission`) é cosmética: ela
  evita anunciar tela que o usuário não pode abrir. **A autorização real é
  sempre a do backend.**
- Ao criar um módulo, adicione as permissões em
  `src/common/tenancy/default-roles.ts` — fonte única do catálogo e dos papéis.

### Banco

- Toda tabela de negócio tem `companyId` e `deletedAt`.
- Exclusão é sempre lógica. Registrar a entidade em
  `src/trash/trash-entities.ts` é o que a torna restaurável.
- Migration nunca é editada depois de aplicada; corrija com uma nova.

### Código

- Comentário explica **por quê**, não o quê. O código já diz o quê.
- Português no domínio (nome de módulo, rota, rótulo) e nos comentários;
  inglês no que é técnico (nome de model, campo, tipo).
- `npm run lint` e `npm run type-check` passam com zero warnings. O hook de
  pre-commit (husky + lint-staged) roda ESLint e Prettier no que mudou.

---

## 8. Rodar

```bash
npm install
docker compose -f docker/docker-compose.yml up -d   # Postgres

cp apps/api/.env.example apps/api/.env              # defina os segredos JWT
cp apps/web/.env.example apps/web/.env

npm run prisma:migrate --workspace=api
npm run prisma:seed --workspace=api                 # catálogo de permissões

npm run dev                                         # web :5173 · api :3000
```

`SEED_DEMO=true` acrescenta uma empresa-vitrine com dados de exemplo e senha
conhecida. **Nunca em ambiente publicado.**

---

## 9. Documentos relacionados

| Documento                                            | Assunto                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [BUSINESS_RULES.md](BUSINESS_RULES.md)               | Regras de negócio da EDS, por módulo                                                                                                    |
| [docs/architecture.md](docs/architecture.md)         | Decisões de arquitetura em detalhe                                                                                                      |
| [docs/deploy.md](docs/deploy.md)                     | Publicação                                                                                                                              |
| [docs/onboarding_dba.md](docs/onboarding_dba.md)     | Banco de dados                                                                                                                          |
| [docs/plano-evolucoes.md](docs/plano-evolucoes.md)   | Backlog técnico                                                                                                                         |
| [docs/plano-bifurcacao.md](docs/plano-bifurcacao.md) | **Histórico.** Análise de quando o projeto ainda era avaliado como SaaS. Mantido como registro da decisão; não descreve o estado atual. |
