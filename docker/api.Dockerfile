# syntax=docker/dockerfile:1

# Build a partir da RAIZ do monorepo (o contexto precisa enxergar
# package-lock.json e packages/), não de dentro de apps/api:
#   docker build -f docker/api.Dockerfile -t eds-api .

# ---------------------------------------------------------------------------
# deps — só os manifests primeiro, para o layer do `npm ci` (o passo caro)
# invalidar apenas quando um package.json/lock mudar, e não a cada edição
# de código.
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# openssl: sem ele o CLI do Prisma (usado no estágio `migrate`) avisa a cada
# execução que não conseguiu detectar a versão do libssl. A imagem final não
# precisa — ela usa o query compiler wasm, sem engine nativa.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# `npm ci` valida o lockfile contra TODOS os workspaces declarados na raiz —
# por isso o package.json do web e dos packages vem junto, mesmo esta imagem
# sendo só da API. Sem eles o npm falha por workspace ausente.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci

# ---------------------------------------------------------------------------
# build — gera o Prisma Client (task `db:generate`, da qual `build` depende
# no turbo.json) e compila o Nest para apps/api/dist.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npx turbo run build --filter=api

# ---------------------------------------------------------------------------
# migrate — imagem separada, usada como job de pré-deploy:
#   docker build -f docker/api.Dockerfile --target migrate -t eds-api-migrate .
#   grep -E '^(DATABASE_URL|DIRECT_URL)=' apps/api/.env | tr -d '"' > /tmp/m.env
#   docker run --rm --env-file /tmp/m.env eds-api-migrate; rm -f /tmp/m.env
#
# O `tr -d '"'` NÃO é firula: `docker run --env-file` entrega o valor LITERAL,
# aspas incluídas, ao contrário do `docker compose --env-file`, que as remove.
# Com as aspas, o Prisma recebe `"postgresql://…` e falha com um P1013 que
# fala em "scheme not recognized" — sem nenhuma pista de que o problema é
# citação. Aconteceu no deploy da Integração Fiscal em 2026-08-05.
#
# Fica fora da imagem final de propósito: `prisma migrate deploy` precisa do
# CLI do Prisma (devDependency), do prisma.config.ts e do dotenv — nada disso
# tem por que viajar junto com o runtime, que só precisa do Client gerado.
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# prod-deps — o mesmo `npm ci`, sem devDependencies, para a imagem final.
# ---------------------------------------------------------------------------
FROM node:22-slim AS prod-deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
# `--workspace api` evita instalar as dependências de produção do app web
# (react, radix, recharts, lucide…) numa imagem que só roda a API.
RUN npm ci --omit=dev --workspace api --include-workspace-root && npm cache clean --force

# ---------------------------------------------------------------------------
# runner — imagem final.
# O layout do monorepo é preservado (/app/node_modules + /app/apps/api/dist)
# porque o código compilado referencia o Prisma Client por caminho relativo
# (`dist/prisma/prisma.service.js` → `../../generated/prisma/client`) e porque
# a resolução de módulos precisa achar tanto o node_modules hoisted da raiz
# quanto um eventual node_modules aninhado em apps/api.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# Traz apps/{api,web}/package.json e qualquer node_modules aninhado que o npm
# tenha deixado de fora do hoisting da raiz.
COPY --from=prod-deps --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/generated ./apps/api/generated

# Uploads (holerites, documentos de contrato, logo, anexos de workflow) são
# gravados em `process.cwd()/uploads`. Em produção monte um volume aqui —
# sem isso os arquivos somem a cada novo deploy do container.
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
VOLUME ["/app/apps/api/uploads"]

WORKDIR /app/apps/api
USER node
EXPOSE 3000

# Liveness (só o processo Node), NÃO readiness. Sem curl na imagem, o fetch
# nativo do Node basta.
#
# A readiness consulta o Postgres, e era esse o problema: a cada 30s, 24h por
# dia, ela mantinha acordado um banco serverless com scale-to-zero. O Neon só
# hiberna após ~5 min ocioso, então o compute nunca desligava — 730h/mês contra
# as ~192h do plano. Em 25/08 o projeto chegou a 91,2% da cota por causa disso.
#
# Trocar por liveness também alinha o healthcheck com a sua semântica: o Docker
# usa esse resultado para marcar o container unhealthy e reiniciá-lo, e banco
# fora do ar não é motivo para reiniciar o processo — é o que o comentário de
# `health.controller.ts` já dizia. Readiness continua existindo para quem
# decide roteamento de tráfego (load balancer, orquestrador), que é o lugar
# onde "consigo falar com o banco?" é a pergunta certa.
#
# O start-period generoso continua fazendo sentido: cobre o boot do Node e a
# aplicação das migrations no primeiro deploy.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/liveness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use `--init` no `docker run` (ou `init: true` no compose) para o SIGTERM
# chegar ao Node como PID 1 e o `enableShutdownHooks()` fechar o Prisma limpo.
CMD ["node", "dist/main.js"]
