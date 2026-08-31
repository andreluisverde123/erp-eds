# Ambientes

Como o ERP EDS separa local, development, staging e production.

## O mapa

| Ambiente        | Banco                   | Arquivo de env              | Quem carrega o arquivo                            |
| --------------- | ----------------------- | --------------------------- | ------------------------------------------------- |
| **local**       | Postgres em container   | `apps/api/.env`             | `ConfigModule` do Nest (default) em `npm run dev` |
|                 |                         | `apps/api/.env.local`       | `--env-file` nos scripts `*:local`                |
| **development** | Neon (branch `eds-dev`) | `apps/api/.env.development` | `--env-file` / `DOTENV_CONFIG_PATH`               |
| **staging**     | Neon (`eds-staging`)    | `apps/api/.env.staging`     | `--env-file` / `DOTENV_CONFIG_PATH`               |
| **production**  | Neon (produção)         | `apps/api/.env.production`  | `--env-file` / `DOTENV_CONFIG_PATH`               |

No frontend a lista **não** é a mesma, e a diferença não é estética — o Vite
impõe o significado de dois nomes:

| Ambiente    | Arquivo no web              | Modo do Vite                            |
| ----------- | --------------------------- | --------------------------------------- |
| local       | `apps/web/.env.development` | `development` — é o modo do `vite dev`  |
| development | (não existe hoje)           | precisaria de nome próprio — ver abaixo |
| staging     | `apps/web/.env.staging`     | `vite build --mode staging`             |
| production  | `apps/web/.env.production`  | `vite build --mode production`          |

Duas regras do Vite que ditam isso:

1. **`--mode local` é recusado com erro.** O Vite reserva o sufixo `.local` para
   sobreposição por máquina (`.env.staging.local`) e se recusa a tratá-lo como
   nome de modo. Não existe, portanto, `.env.local` nem `build:local` no web.
2. **`development` é o modo padrão do `vite dev`.** `npm run dev` lê
   `.env.development`. Esse arquivo descreve a máquina do desenvolvedor, não um
   ambiente remoto.

> **Local agora usa origem única, como os ambientes publicados.**
> `VITE_API_URL` era `http://localhost:3000` no desenvolvimento e `/api` em
> staging/produção — local era o único ambiente com front e API em origens
> diferentes. Isso deixou de servir quando o Diário de Obras passou a ser
> acessado por subdomínio (`diario.localhost:5173`): dali, uma chamada para
> `localhost:3000` é **cross-site** para o navegador, e o cookie `SameSite=Lax`
> do refresh token não é enviado — a sessão morreria a cada recarga, só na
> máquina do desenvolvedor. Hoje o `server.proxy` do Vite repassa `/api` para a
> API, do mesmo jeito que o nginx faz lá fora, e o par obrigatório disso é
> `REFRESH_COOKIE_PATH=/api/auth` na API. Ver `docs/diario-de-obras.md`.

Se um dia existir um ambiente de desenvolvimento **publicado**, ele precisa de um
modo próprio (`--mode devshared` + `.env.devshared`). Reaproveitar `development`
faria o build remoto e o servidor de dev lerem a mesma configuração, e uma das
duas estaria errada.

**Nenhuma dependência nova foi adicionada.** Os quatro ambientes usam mecanismos
que já existiam:

| Mecanismo                      | Quem usa             | O que faz                                                |
| ------------------------------ | -------------------- | -------------------------------------------------------- |
| `node --env-file=X`            | runtime da API       | nativo do Node 20.6+                                     |
| `DOTENV_CONFIG_PATH=X`         | Prisma CLI           | lido pelo `import 'dotenv/config'` do `prisma.config.ts` |
| `vite build --mode X`          | build do web         | o Vite carrega `.env.X` sozinho                          |
| `--env-file` do Docker Compose | stack containerizada | já usado pelo `docker-compose.prod.yml`                  |

---

## A armadilha do `NODE_ENV` — leia antes de configurar staging

O schema de validação aceita `NODE_ENV=staging`. **Não use.** Quatro
comportamentos do sistema estão presos a `NODE_ENV === 'production'`, e todos
degradam **em silêncio** com qualquer outro valor:

| Onde                      | Com `production`             | Com `staging`                    |
| ------------------------- | ---------------------------- | -------------------------------- |
| `env.validation.ts:38,43` | `sslmode` obrigatório na URL | não exigido                      |
| `env.validation.ts:53`    | `CORS_ORIGIN` obrigatória    | cai para `http://localhost:5173` |
| `refresh-cookie.ts:24`    | cookie de refresh `Secure`   | **sem `Secure`**                 |
| `app.module.ts:54`        | logs em JSON                 | pino-pretty                      |

Um staging assim não valida o que produção vai fazer — que é a única razão de
staging existir. Pior: os dois primeiros são exatamente as proteções adicionadas
na Sprint 0.

**Regra adotada:** `NODE_ENV` significa _modo de execução_, não _nome do
ambiente_. Todo ambiente publicado (development, staging, production) roda com
`NODE_ENV=production`. O ambiente é identificado pelo **arquivo carregado** e
pelos valores dentro dele — branch do Neon, domínio no `CORS_ORIGIN`, segredos
JWT próprios.

Só `local` usa `NODE_ENV=development`, e é o único onde as quatro diferenças
acima são desejáveis.

> Se algum dia for preciso distinguir os ambientes dentro do código (ex.: um
> banner "STAGING" na interface), o caminho é uma variável nova — e não relaxar
> `NODE_ENV`. Isso seria funcionalidade nova e está fora do escopo atual.

---

## Templates versionados × arquivos reais

```
apps/api/.env.example                 versionado  referência canônica de cada variável
apps/api/.env.local.example           versionado  template
apps/api/.env.development.example     versionado  template
apps/api/.env.staging.example         versionado  template
apps/api/.env.production.example      versionado  template

apps/api/.env.staging                 IGNORADO    contém a credencial real do Neon
apps/api/.env.production              IGNORADO    idem
```

O `.gitignore` ignora `.env*` e abre exceção para `!.env.example` e
`!.env.*.example`. Só os templates entram no repositório; credencial nunca.

Para configurar um ambiente:

```bash
cp apps/api/.env.staging.example apps/api/.env.staging
cp apps/web/.env.staging.example apps/web/.env.staging
# preencha os placeholders
```

Os arquivos por ambiente são **completos**, não incrementais: `node --env-file`
e `DOTENV_CONFIG_PATH` **substituem** o ambiente, não fazem merge com `.env`.
A referência do que cada variável significa continua sendo `.env.example` — os
demais trazem só o valor e o que muda naquele ambiente.

---

## Precedência de variáveis

Verificado no código do `@nestjs/config` (`config.module.js:81`):

```js
config = { ...arquivoDeEnv, ...process.env }; // process.env VENCE
```

E depois, ao gravar de volta (`assignVariablesToProcess`), só escreve chaves que
ainda **não** existem em `process.env`.

Consequência prática: `node --env-file=.env.staging` popula `process.env` antes
do Nest subir, então **o arquivo de staging vence** mesmo que exista um `.env`
local na pasta. Não há ambiguidade — e é por isso que nenhum código de
aplicação precisou mudar.

Ordem final, do mais forte ao mais fraco:

1. Variáveis já no ambiente do processo (`--env-file`, `docker run -e`, orquestrador)
2. `apps/api/.env` (default do ConfigModule)
3. Defaults do schema Joi (`env.validation.ts`)

No **Vite** a ordem é outra, e é nativa dele:
`.env.<mode>.local` > `.env.<mode>` > `.env.local` > `.env`.

---

## Scripts

Todos no formato `<ação>:<ambiente>`.

### Banco (workspace `api`, ou pela raiz)

| Script            | O que faz                                 | Escreve no banco? |
| ----------------- | ----------------------------------------- | ----------------- |
| `db:status:<amb>` | compara migrations aplicadas × pasta      | **não** — leitura |
| `migrate:<amb>`   | `prisma migrate deploy`                   | sim — DDL         |
| `seed:<amb>`      | catálogo de permissões (+ bootstrap/demo) | sim — dados       |
| `studio:<amb>`    | abre o Prisma Studio                      | se você editar    |

`db:status` é o comando certo para **validar uma conexão nova**: conecta, lê e
sai, sem alterar nada.

### Aplicação

| Script             | Onde | Observação                                                     |
| ------------------ | ---- | -------------------------------------------------------------- |
| `start:<amb>`      | api  | roda `dist/main` com `--env-file`; exige `npm run build` antes |
| `build:staging`    | raiz | só o **web** muda de fato; na API é alias de `build`           |
| `build:production` | raiz | idem                                                           |
| `preview:staging`  | web  | serve o bundle de staging localmente                           |

Não existe `build:local` nem `build:development` no web: `local` é um nome de
modo recusado pelo Vite, e `development` é o modo do servidor de dev — buildar
nele produziria um bundle apontando para `localhost:3000`. Para desenvolvimento
use `npm run dev`, que serve a partir do código-fonte.

Por que `build:<amb>` só importa no web: o Vite resolve `import.meta.env.VITE_*`
em tempo de **build** e crava o valor no bundle. O `nest build` só compila
TypeScript — nenhuma variável entra no artefato da API, que lê tudo em runtime.

As tasks `build:staging`/`build:production` estão declaradas no `turbo.json` com
`env` explícito. Sem isso, o cache do turbo serviria o build de staging para um
build de produção — o bundle sairia com a URL do ambiente errado e nada no log
denunciaria.

---

## Prisma em múltiplos ambientes

Revisado; nenhuma mudança foi necessária. O que já estava correto:

- **`datasource`** (`schema.prisma`) declara só `provider = "postgresql"`, sem
  `url`. Quem fornece a conexão é o `prisma.config.ts` — é o que permite trocar
  de ambiente sem tocar no schema.
- **`prisma.config.ts`** já usa `import 'dotenv/config'`, que respeita
  `DOTENV_CONFIG_PATH`. Foi o que permitiu os scripts por ambiente sem alterar
  uma linha de código.
- **`generate`** não precisa de banco: o config só exige `DIRECT_URL` para
  `migrate`, `db` e `studio`, e usa um placeholder no resto. É o que faz o build
  da imagem Docker e o CI funcionarem sem credencial.
- **`seed`** roda como processo filho do CLI e **herda** o ambiente — verificado:
  com `DOTENV_CONFIG_PATH=.env.X`, o seed conecta no banco de X, não no `.env`.
- **Migrations** são as mesmas em todos os ambientes: uma pasta só, aplicada por
  `migrate deploy`. Nunca use `migrate dev` fora de local — ele compara o schema
  com o banco e pode propor reset.

Um cuidado que o Prisma não impõe: **`DIRECT_URL` precisa ser o endpoint do Neon
sem `-pooler`**. O pooler em transaction mode não suporta os comandos de DDL e
advisory lock que o Migrate executa.

---

## Docker

O `docker-compose.prod.yml` já lê as variáveis do ambiente do shell, então
serve os quatro ambientes sem arquivo novo:

```bash
docker compose -p eds-staging -f docker/docker-compose.prod.yml \
  --env-file apps/api/.env.staging up -d
```

Use `-p <projeto>` para isolar stacks: sem isso, subir staging derruba os
containers de produção na mesma máquina.

Uma diferença que o compose **não** resolve sozinho: `VITE_API_URL` é build-arg,
não variável de runtime. Com `VITE_API_URL=/api` (origem única) a mesma imagem
serve qualquer domínio e o problema desaparece — é o default do compose.

---

## Ordem de promoção

```
local  →  development  →  staging  →  production
```

Uma migration só chega a produção depois de ter sido aplicada em staging **com
`migrate deploy`**, que é o mesmo comando de produção. `migrate dev` (usado em
local) gera a migration; `migrate deploy` apenas aplica o que já existe na pasta.
