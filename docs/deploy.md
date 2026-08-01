# Deploy

Runbook de produção da plataforma. Tudo aqui foi executado de ponta a ponta contra a
stack containerizada (build das imagens → migrations → seed → login → rota
protegida → SPA), não é receita teórica.

## Peças

| Componente | Imagem                                       | O que é                                          |
| ---------- | -------------------------------------------- | ------------------------------------------------ |
| API        | `docker/api.Dockerfile`                      | NestJS compilado, rodando como usuário `node`    |
| Migrations | `docker/api.Dockerfile` (`--target migrate`) | Prisma CLI + schema, para job de pré-deploy      |
| Web        | `docker/web.Dockerfile`                      | Bundle do Vite + nginx, que também repassa a API |
| Banco      | Supabase (ou Postgres gerenciado)            | Fora das imagens                                 |

## Origem única

Só o nginx (serviço `web`) fica exposto. Ele serve o SPA e repassa `/api` para
a API, que não publica porta nenhuma para fora da rede do compose. Duas razões:

1. **O cookie do refresh token é `SameSite=Lax`.** Com front e API em domínios
   diferentes o navegador não o envia no refresh, e a sessão morre 15 minutos
   depois do login — sintoma clássico de "está me deslogando sozinho".
2. **Nenhuma URL absoluta entra no bundle** (`VITE_API_URL=/api`). A mesma
   imagem roda no túnel temporário de hoje e no domínio definitivo de amanhã,
   sem rebuild.

Detalhe que vale saber: quando a API vive atrás desse proxy, o navegador vê
`/api/auth/refresh`, então o cookie precisa nascer em `/api/auth` — é o que
`REFRESH_COOKIE_PATH=/api/auth` faz (o compose já define). Com o valor errado
tudo parece funcionar até o access token expirar.

## 1. Variáveis de ambiente

`apps/api/.env.example` é a lista completa e o schema em
`apps/api/src/config/env.validation.ts` é quem manda: **a API não sobe** se
faltar variável obrigatória ou o formato estiver errado — de propósito, para o
erro aparecer no boot e não na primeira requisição.

Mínimo para produção:

```
NODE_ENV=production
CORS_ORIGIN=https://app.seu-dominio.com     # obrigatória quando NODE_ENV=production
TRUST_PROXY=1                                # 1 = há um proxy/LB na frente
DATABASE_URL=postgresql://…:6543/postgres?pgbouncer=true   # pooler (runtime)
DIRECT_URL=postgresql://…:5432/postgres                    # direta (migrations)
JWT_ACCESS_SECRET=…                          # ≥ 32 caracteres, diferente por ambiente
JWT_REFRESH_SECRET=…                         # ≥ 32 caracteres, diferente do de cima
LOG_LEVEL=info
```

`TRUST_PROXY` não é detalhe: com `0` atrás de um load balancer, o rate limit
(`ThrottlerModule`, 100 req/min) passa a contar **todo o tráfego como um único
cliente** — um usuário sozinho bloqueia todo mundo. Com `1` sem proxy nenhum na
frente, o problema é o inverso: qualquer cliente forja o `X-Forwarded-For` e
escapa do limite. Use `1` em produção, `0` em desenvolvimento.

## 2. HTTPS não é opcional

O refresh token vai num cookie `HttpOnly; Secure; SameSite=Lax; Path=/auth`
(`apps/api/src/auth/auth.controller.ts`). Consequências práticas:

- **`Secure`** — servido em HTTP puro, o browser descarta o cookie e o usuário
  cai no login a cada 15 minutos (quando o access token expira). Produção
  precisa de TLS nos dois lados.
- **`SameSite=Lax`** — funciona com front e API no mesmo domínio registrável
  (`app.seu-dominio.com` + `api.seu-dominio.com`). Se a API ficar num domínio
  totalmente diferente do front, o browser não manda o cookie no refresh e é
  preciso trocar para `SameSite=None` (que exige `Secure`) no
  `cookieOptions()`.

## 3. Migrations

Sempre **antes** de subir a versão nova da API, nunca no boot do container (N
réplicas subindo em paralelo tentariam migrar ao mesmo tempo):

```bash
docker build -f docker/api.Dockerfile --target migrate -t eds-api-migrate .
docker run --rm \
  -e DIRECT_URL="postgresql://…:5432/postgres" \
  eds-api-migrate                      # → prisma migrate deploy
```

Fora de container, o equivalente é `npm run prisma:deploy --workspace api`.
O CLI usa `DIRECT_URL` (porta 5432, sem pooler): o Supavisor em transaction
mode não suporta os comandos de DDL/advisory lock do Migrate.

Seed (só na primeira subida de um banco vazio — cria os 6 papéis, as
permissões e os usuários de exemplo):

```bash
docker run --rm -e DIRECT_URL="…" --entrypoint sh eds-api-migrate -c "npx prisma db seed"
```

## 4. Build e subida

```bash
# API
docker build -f docker/api.Dockerfile -t eds-api .

# Web — VITE_API_URL é assado no bundle em tempo de BUILD.
# Definir a variável no `docker run` não tem efeito nenhum; cada ambiente
# (staging/produção) precisa da sua própria imagem.
docker build -f docker/web.Dockerfile \
  --build-arg VITE_API_URL=https://api.seu-dominio.com -t eds-web .
```

Ou a stack inteira:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d --build
```

O compose espera um banco externo (Supabase). Para subir tudo numa máquina só
(homologação/demo), use `--profile local-db`, que adiciona um Postgres 16.

## 4b. URL temporária com Cloudflare Tunnel

Para alguém testar antes de existir domínio. Sobe a stack inteira mais um
container `cloudflared`, que publica o nginx numa URL HTTPS aleatória — sem
domínio, sem conta na Cloudflare, sem abrir porta no roteador:

```bash
docker compose -f docker/docker-compose.prod.yml --profile local-db --profile tunnel up -d --build

# a URL aparece no log do túnel
docker compose -f docker/docker-compose.prod.yml logs tunnel | grep trycloudflare.com
```

Antes de mandar o link:

- **Aplique as migrations** no banco da stack (`--target migrate`, seção 3).
  Deixar o banco vazio é proposital: sem seed não há credencial padrão exposta,
  e quem for testar cria a própria construtora em `/cadastro`.
- **A URL muda a cada restart** do container do túnel, e o túnel morre junto
  com a máquina que o hospeda. É para uma sessão de teste, não para produção.
- **Acesse pela URL do túnel, não por `http://localhost`.** Em `NODE_ENV=production`
  o cookie de sessão é `Secure`: o navegador o descarta em HTTP puro, e o
  login parece funcionar mas cai no primeiro refresh.
- O cadastro fica **público e sem verificação de e-mail** (o módulo de e-mail
  ainda não existe). O limite é de 5 cadastros por hora por IP; ainda assim,
  não divulgue a URL além de quem vai testar.

## 5. Health checks

| Rota                | Uso                                                                |
| ------------------- | ------------------------------------------------------------------ |
| `/health`           | Diagnóstico completo: banco + heap + RSS                           |
| `/health/liveness`  | Só o processo. Falhou = reinicie o container                       |
| `/health/readiness` | Processo + banco. Falhou = tire do balanceamento, **não** reinicie |

As três são `@Public()` (sem token, sem rate limit) porque quem bate nelas é o
orquestrador. A imagem da API já traz um `HEALTHCHECK` apontando para
`/health/readiness`.

## 6. Uploads

Anexos (holerites, documentos de contrato, logo da empresa, anexos de
workflow) têm dois destinos possíveis, escolhidos por `STORAGE_DRIVER`:

**`local` (padrão)** grava em `<cwd>/uploads`. Em container, monte um volume em
`/app/apps/api/uploads` — o `docker-compose.prod.yml` já faz. Sem o volume,
todo arquivo enviado some no próximo deploy. **Só funciona com uma instância
da API**: com duas réplicas, o arquivo que subiu numa não existe na outra, e o
download falha de forma intermitente.

**`s3`** funciona com qualquer serviço compatível — AWS S3, MinIO, Cloudflare
R2, Supabase Storage:

```
STORAGE_DRIVER=s3
S3_BUCKET=eds-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
# fora da AWS (MinIO, R2): o bucket não vai no subdomínio
S3_ENDPOINT=https://…
S3_FORCE_PATH_STYLE=true
```

Trocar de driver não exige migração de dados: o banco guarda o caminho
(`/uploads/payslips/<uuid>.pdf`), não a localização física. Mas os arquivos
antigos não se movem sozinhos — copie o conteúdo de `uploads/` para o bucket
antes de virar a chave, senão os anexos já existentes passam a dar 404.

Nos dois drivers os arquivos continuam sendo servidos **pela API**, com JWT,
mesma empresa e permissão do módulo. Não há URL pública nem assinada: uma URL
assinada vale por tempo, pode ser repassada e escaparia dessas checagens.

## 7. Desligamento

A API chama `enableShutdownHooks()`, então o `SIGTERM` do deploy fecha o pool
do Prisma antes de sair. Rode o container com `--init` (ou `init: true` no
compose) para o sinal chegar ao Node como PID 1 — sem isso o processo é morto
na marra depois do timeout.

## 8. CI

`.github/workflows/ci.yml` roda em todo push/PR:

1. **verify** — lint, type-check, build e testes unitários.
2. **e2e** — sobe um Postgres, aplica as migrations do zero, roda o seed e
   executa o smoke test de bootstrap (`apps/api/test/app.e2e-spec.ts`). É o
   passo que pega migration faltando na pasta.
3. **docker** — constrói as duas imagens (sem publicar), pegando quebras que só
   aparecem no build limpo do container.

Não há passo de `prettier --check`: a base de código nunca passou pelo
prettier (261 arquivos divergem hoje). Para ligar, rode `npm run format` uma
vez na raiz e adicione o passo ao job `verify`.
