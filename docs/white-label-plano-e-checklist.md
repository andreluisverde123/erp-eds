# ERP white-label — plano e checklist de implantação

> **Andamento (16/09/2026):** Etapas 1 e 3 feitas na branch `feat/white-label`,
> ainda não publicadas. A marca agora é uma pasta por cliente
> (`apps/web/brands/<id>/`), escolhida por `VITE_BRAND`. Ver "Como ficou",
> no fim.

Situação em 16/09/2026. O modelo proposto é **uma instalação por cliente**: o
mesmo código, com projeto, banco, bucket e domínio próprios. O cliente não
divide banco com ninguém; o `companyId` que já existe continua como defesa
extra.

---

## Parte 1 — O que já está pronto e o que falta

### Já pronto

| O quê | Onde |
| --- | --- |
| Nome do sistema editável | Configurações → Sistema (`SystemSettings.erpName`) |
| Logo e dados cadastrais da empresa, usados nos PDFs | Configurações → Empresa (`Company`) |
| Coluna para cor da marca no banco | `Company.primaryColor` / `secondaryColor`, que **existem mas nada lê** |
| Troca de cor com contraste automático | `features/demo-brand/brand-tokens.ts`, que hoje **só roda em desenvolvimento** |
| Domínio, CORS e cookie por variável de ambiente | `CORS_ORIGIN`, `REFRESH_COOKIE_DOMAIN` |
| Primeiro admin sem tela de cadastro | `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` |
| Diário por subdomínio ou `/diario` | `diario.<domínio>` ou `<domínio>/diario` |
| Ambientes separados | `.env.<ambiente>`, `vite --mode` |

### O que ainda está preso à EDS no código

| Onde | O quê |
| --- | --- |
| `packages/types/src/company.ts` | nome "ERP EDS", "EDS Construtora", CNPJ, cor `#ED2124`, `/logo-eds.svg` |
| `packages/ui/src/styles/globals.css` | vermelho EDS em 7 tokens de cor |
| `apps/web/index.html` | título, descrição, `theme-color`, logo do splash |
| `apps/web/public/manifest.webmanifest` | nome e cor do app instalável |
| `apps/web/public/logo-eds.svg`, `favicon.svg` | arquivos da marca |
| `apps/api/prisma/seed/bootstrap.ts` | `COMPANY_SLUG = 'eds'`, `DEFAULT_COMPANY_NAME = 'EDS Construtora'` |
| `apps/api/src/auth/auth.service.ts` | `admin@obrei.com` isento de suspensão, fixo no código |
| `apps/web/src/config/modules.ts` | Orçamentos ligado/desligado por constante (exige rebuild) |
| `localStorage` do web | chaves `eds:…` (filtros, favoritos, colunas) |
| User-Agent da API | `ERP-EDS/fiscal-sync`, `ERP EDS; carga de bases` |
| Contrato em PDF | texto das cláusulas único para todos (revisão jurídica por cliente?) |
| Comentários e docs | "este ERP é proprietário da EDS e não é vendido" (`company.ts`, `PROJECT_SCOPE.md`) |

---

## Parte 2 — O que fazer para que "vender" seja só configurar

A meta: **nenhuma alteração de código por cliente.** Tudo sai de variável de
ambiente (antes do login) ou do banco (depois do login).

### Etapa 1 — Marca antes do login (variáveis de build)

O que aparece antes de qualquer JavaScript (aba, splash, manifest, ícone) não
consegue ler o banco.

- [ ] Criar variáveis de build: `VITE_BRAND_APP_NAME`, `VITE_BRAND_SHORT_NAME`,
      `VITE_BRAND_DESCRIPTION` e `VITE_BRAND_COLOR`.
- [ ] Fazer o Vite substituir essas variáveis no `index.html` e gerar o
      `manifest.webmanifest`.
- [ ] Trocar `/logo-eds.svg` e `/favicon.svg` por uma pasta
      `public/brand/` (`logo.svg`, `symbol.svg`, `favicon.svg`). O deploy
      copia os arquivos do cliente para essa pasta antes do build.
- [ ] `company.ts` passa a ler essas variáveis. A EDS vira só um conjunto de
      valores, no `.env` dela.

### Etapa 2 — Marca depois do login (banco, sem rebuild)

- [ ] Aplicar `Company.primaryColor` em tempo de execução, reaproveitando o
      `brand-tokens.ts` (já calcula os 7 tokens e o contraste do texto). Hoje
      ele só roda no painel de demonstração.
- [ ] Campo de **cor da marca** em Configurações → Empresa, com prévia.
- [ ] Rota pública `GET /public/brand` (nome, logo, cor) para a **tela de
      login** já sair com a marca do cliente, mesmo antes de entrar.
- [ ] Manter o vermelho de "Excluir" independente da marca. O
      `--destructive` deve ser escurecido, porque hoje ele quase coincide com
      o vermelho da EDS.

### Etapa 3 — Tirar o que é da EDS do código

- [ ] `bootstrap.ts`: nome e slug da empresa vêm de `BOOTSTRAP_COMPANY_NAME` e
      `BOOTSTRAP_COMPANY_SLUG`.
- [ ] Isenção de suspensão: `admin@obrei.com` vira a variável
      `SUSPENSION_EXEMPT_EMAILS`.
- [ ] Chaves de `localStorage`: prefixo neutro (`erp:`). Uma migração lê as
      chaves antigas uma vez, para a EDS não perder filtros e favoritos.
- [ ] User-Agent com nome neutro.
- [ ] Módulos por cliente: trocar `MODULO_ORCAMENTOS_ATIVO` por configuração
      (variável ou `SystemSettings`). Menu, rotas e permissões passam a
      obedecer a ela.
- [ ] Atualizar `company.ts`, `PROJECT_SCOPE.md` e a documentação: o ERP
      deixa de ser "exclusivo da EDS".

### Etapa 4 — Instalação repetível

- [ ] Um `.env.cliente.example` com **todas** as variáveis, comentadas.
- [ ] Um script `novo-cliente`: gera segredos, cria o `.env` e confere que
      nada ficou vazio.
- [ ] Um roteiro de publicação por cliente, com o checklist da Parte 3.

Tudo isso passa primeiro pelo staging da EDS. A EDS precisa continuar
idêntica depois da mudança, e esse é o teste de aceite.

---

## Parte 3 — Checklist a cada venda

Copie esta seção para cada cliente e marque.

**Cliente:** ______________________ **Domínio:** ______________________
**Responsável técnico:** __________ **Data de entrega:** ____________

### A. Dados a coletar com o cliente

- [ ] Razão social, nome fantasia, CNPJ, inscrição estadual
- [ ] Endereço completo (rua, número, bairro, cidade, UF, CEP)
- [ ] E-mail, telefone, site
- [ ] Nome do responsável legal (vai nos contratos)
- [ ] Nome do sistema (ex.: "ERP Construtora X")
- [ ] **Logo horizontal** em SVG (para as telas) **e em PNG** (para os PDFs,
      porque o gerador de PDF não desenha SVG nem WEBP)
- [ ] **Símbolo quadrado** (favicon e ícone do app), SVG ou PNG de 512×512
- [ ] **Cor da marca** em hex. Conferir o contraste com texto branco.
- [ ] Domínio desejado (`gestao.cliente.com.br`) e quem controla o DNS
- [ ] Diário de Obras: vai usar? Por subdomínio (`diario.…`) ou por caminho
      (`/diario`)?
- [ ] Módulos contratados (Compras, Financeiro, RH, Fiscal, Diário,
      Orçamentos…)
- [ ] Lista de usuários iniciais: nome, e-mail, papel
- [ ] Cidade do foro para contratos; o texto das cláusulas foi aprovado pelo
      jurídico do cliente?
- [ ] Fiscal: certificado A1 (.pfx) e senha, se usar NF-e/DF-e
- [ ] Dados bancários, se usar pagamentos

### B. Infraestrutura (uma por cliente)

- [ ] **Banco:** projeto Neon próprio (plano adequado ao volume; o Free tem
      0,5 GB). Anotar `DATABASE_URL` (pooler) e `DIRECT_URL`.
- [ ] Backup/restauração (PITR) ativo no plano escolhido
- [ ] **Arquivos:** bucket próprio (R2/S3) e chave de acesso restrita a ele
- [ ] **Hospedagem:** projeto Railway próprio com os serviços API e web e os
      ambientes `staging` e `production`
- [ ] **DNS:** apontar o domínio (e `diario.`, se usado) para o serviço web.
      Atenção: o Railway limita domínios personalizados **por serviço**.
- [ ] Certificado TLS emitido e válido nos endereços usados

### C. Variáveis de ambiente

API:

- [ ] `DATABASE_URL`, `DIRECT_URL` (com `sslmode=require`)
- [ ] `CORS_ORIGIN` = todos os endereços do cliente, separados por vírgula
- [ ] `TRUST_PROXY`, `REFRESH_COOKIE_PATH=/api/auth`
- [ ] `REFRESH_COOKIE_DOMAIN` = `.cliente.com.br` **só** se o Diário usar
      subdomínio e o login tiver que valer nos dois
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: **novos**, nunca copiados de
      outro cliente
- [ ] `FISCAL_CERT_ENCRYPTION_KEY`, `BANK_DATA_ENCRYPTION_KEY`: **novas** e
      **guardadas num cofre**. Se forem perdidas, o certificado e os dados
      bancários gravados não podem mais ser lidos.
- [ ] `STORAGE_DRIVER=s3` + `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`,
      `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`
- [ ] `FISCAL_SYNC_ENABLED` (só com certificado cadastrado)
- [ ] `REFERENCE_BASES_AUTO_UPDATE=false` (só ligar se Orçamentos for
      contratado, e com espaço no banco)
- [ ] `SEED_DEMO=false`, `PUBLIC_SIGNUP_ENABLED=false`
- [ ] `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (senha forte,
      entregue por canal seguro)
- [ ] `NODE_ENV=production` também no staging do cliente

Web (build):

- [ ] `VITE_API_URL=/api`
- [ ] `VITE_ENVIRONMENT_LABEL` (só no staging: "AMBIENTE DE TESTES")
- [ ] `VITE_PUBLIC_SIGNUP_ENABLED=false`
- [ ] Variáveis de marca da Etapa 1, quando existirem
- [ ] Arquivos de marca na pasta `public/brand/`, quando existir

### D. Primeira publicação

- [ ] Rodar as migrations (`prisma migrate deploy`) no banco do cliente
- [ ] Rodar o seed de produção com o bootstrap: cria empresa, papéis e admin
- [ ] Publicar API e web. Conferir `/api/health` = 200.
- [ ] Conferir que o **site** publicado é o do commit certo (hash do bundle),
      e não só a API
- [ ] Entrar com o admin e trocar a senha temporária

### E. Configuração dentro do sistema

- [ ] **Configurações → Empresa:** razão social, CNPJ, IE, endereço,
      contatos, responsável, **logo PNG** e cor (quando a Etapa 2 existir)
- [ ] **Configurações → Sistema:** nome do sistema, fuso horário,
      anexos/limite de upload
- [ ] **Perfis:** revisar os papéis padrão e desligar os módulos não
      contratados
- [ ] **Usuários:** criar os iniciais com senha temporária; ligar o
      interruptor do Diário para quem vai a campo
- [ ] **Diário de Obras direto na produção:** não há etapa de teste do Diário
      no staging do cliente. Libera-se na produção: interruptor da pessoa +
      responsável/equipe em cada obra.
- [ ] **Obras:** cadastrar as primeiras e montar a equipe do Diário. Se a
      obra já tinha diários em outro sistema, preencher o **Número do
      primeiro RDO** antes do primeiro RDO, porque depois o campo trava.
- [ ] **Fiscal:** subir o certificado A1, se houver, e testar a sincronização
- [ ] **Terceirizados/Fornecedores:** importar ou cadastrar os primeiros

### F. Testes de aceite (antes de entregar)

- [ ] Login, logout, recarregar a página sem cair
- [ ] Marca correta na aba, login, splash, barra lateral e ícone do app
      instalado
- [ ] Botão "Excluir" visivelmente diferente do botão principal
- [ ] **PDF da ordem de compra:** logo, razão social, CNPJ e endereço do
      cliente
- [ ] **PDF do contrato:** qualificação da contratante completa, sem linha em
      branco; foro correto
- [ ] **RDO:** criar, anexar foto, finalizar, exportar PDF com o logo
- [ ] Diário pelo endereço combinado (subdomínio ou `/diario`)
- [ ] Upload e download de anexo, gravado no bucket **do cliente**
- [ ] Usuário sem permissão não vê os módulos não contratados
- [ ] Nenhum "EDS" visível em lugar nenhum: telas, PDFs, aba, e-mail

### G. Entrega e operação

- [ ] Credenciais do admin entregues por canal seguro
- [ ] Treinamento dos usuários-chave
- [ ] Segredos (JWT e chaves de criptografia) guardados no cofre, por cliente
- [ ] Registro do cliente numa planilha de instalações: domínio, projeto
      Railway, projeto Neon, bucket, versão publicada
- [ ] Processo de suspensão por inadimplência combinado (hoje é via SQL:
      `Company.status = SUSPENDED`)
- [ ] Rotina de atualização: a nova versão passa pelo staging do cliente e só
      então vai para a produção dele

---

## Parte 4 — Decisões pendentes

1. **Instalação por cliente ou uma instalação para todos?** Este documento
   assume uma por cliente, que é mais simples, isolada e já compatível com o
   código. A alternativa (vários clientes num banco) exige muito mais trabalho
   e é o caminho do Engeo.
2. **Relação com o Engeo:** o ERP white-label e o SaaS Engeo são produtos
   separados? O módulo de Orçamentos foi guardado para o Engeo. Ele pode ser
   vendido como módulo deste ERP também?
3. **Cláusulas de contrato:** texto único para todos ou editável por cliente?
4. **Atualizações:** quantos clientes antes de automatizar a publicação
   (hoje é manual, por push de branch)?

---

## Como ficou (branch `feat/white-label`)

- **Marca por pasta:** `apps/web/brands/<id>/` com `brand.json`, `logo.svg` e
  `favicon.svg`. A EDS é `brands/eds/`.
- **Build:** `VITE_BRAND=<id>` escolhe a pasta.
  - O plugin `apps/web/brand/vite-plugin.ts` preenche o `index.html` (título,
    descrição, cor, splash), gera o `manifest.webmanifest`, publica
    `/brand/logo.svg` e `/brand/favicon.svg` e entrega a marca ao código em
    `config/company.ts`.
  - Sem `VITE_BRAND`: `eds` em desenvolvimento, testes e CI.
  - **No Dockerfile é obrigatória**, e o build falha sem ela.
- **Cores:** `globals.css` lê `--brand-primary`, `--brand-primary-foreground`,
  `--brand-pending` e `--brand-pending-foreground`, que o build injeta no
  `index.html`. Só a cor principal é obrigatória; as outras são calculadas
  com contraste legível.
- **Removidos do código:** `EDS_COMPANY` (`packages/types/src/company.ts`), o
  vermelho fixo do `globals.css`, os textos fixos do `index.html` e do
  manifest, `public/logo-eds.svg` e `public/favicon.svg`.
- **Seed de instalação:** `BOOTSTRAP_COMPANY_NAME` virou obrigatório (não há
  mais "EDS Construtora" padrão). O slug sai do nome ou de
  `BOOTSTRAP_COMPANY_SLUG`.
- **Textos:** o login do Diário diz "o mesmo e-mail e senha do <sistema>". O
  User-Agent das chamadas externas ficou neutro.
- **Verificado:**
  - login local da EDS **idêntico pixel a pixel** ao da produção;
  - build com marca fictícia sem nenhum "EDS";
  - imagem Docker com e sem `VITE_BRAND`;
  - 446 testes web e 1.776 da API passando.

**Ficou de fora, de propósito:**

- chaves `eds:` do `localStorage`: invisíveis, e cada cliente tem o próprio
  domínio;
- variáveis `EDS_RESOLVER`/`EDS_API_UPSTREAM` do nginx: renomear exigiria
  mexer no Railway de todos;
- isenção `admin@obrei.com`: é conta do fornecedor, vale para todos;
- `MODULO_ORCAMENTOS_ATIVO`: todos seguem o jeito EDS;
- cor da marca editável pela tela (Etapa 2): a marca já é por instalação.

**Diferença visível na EDS:** só o nome curto do app instalado no celular
(manifest), que passa de "ERP EDS" para "EDS". A aba, o login e as cores
continuam iguais.
