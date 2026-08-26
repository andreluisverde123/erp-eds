# syntax=docker/dockerfile:1

# Build a partir da RAIZ do monorepo:
#   docker build -f docker/web.Dockerfile \
#     --build-arg VITE_API_URL=https://api.seu-dominio.com -t eds-web .
#
# ATENÇÃO: o Vite injeta `import.meta.env.VITE_*` em tempo de BUILD, não de
# execução — o bundle sai com a URL da API cravada dentro. Definir VITE_API_URL
# só no `docker run` não tem efeito nenhum; tem que ser build-arg, e cada
# ambiente (staging/produção) precisa da sua própria imagem.

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci

# ---------------------------------------------------------------------------
# build — `tsc -b && vite build` (o script `build` do app).
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

# A identidade da aplicação NÃO entra por build arg: o ERP é da EDS e a marca
# vem de `packages/types/src/company.ts`, compilada junto com o resto. Não há
# imagem "de outro cliente" a produzir a partir deste Dockerfile.
#
# Auto-cadastro de construtora, desligado. O Vite resolve `import.meta.env` em
# tempo de BUILD, então isto precisa estar aqui e não na subida do container.
ARG VITE_PUBLIC_SIGNUP_ENABLED=false
ENV VITE_PUBLIC_SIGNUP_ENABLED=$VITE_PUBLIC_SIGNUP_ENABLED
COPY turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npx turbo run build --filter=web

# ---------------------------------------------------------------------------
# runner — nginx servindo o SPA estático.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runner
# Em `templates/`, e não direto em `conf.d/`: o entrypoint da imagem oficial do
# nginx passa todo `*.template` por envsubst antes de subir. É o que permite ao
# mesmo arquivo servir o Docker Compose e o Railway, que têm DNS diferentes.
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template

# O filtro é ESSENCIAL: sem ele o envsubst também comeria `$host`,
# `$remote_addr`, `$proxy_add_x_forwarded_for` e companhia — variáveis do
# próprio nginx, que viriam vazias e derrubariam o proxy. Com o filtro, só os
# nomes com prefixo EDS_ são substituídos.
ENV NGINX_ENVSUBST_FILTER="^EDS_"

# Padrões do Docker Compose, para o ambiente atual continuar subindo sem
# precisar declarar nada. O Railway sobrescreve os dois.
ENV EDS_RESOLVER="127.0.0.11 valid=10s ipv6=off"
ENV EDS_API_UPSTREAM="api:3000"
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
