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

# Identidade do produto. O Vite resolve `import.meta.env` em tempo de BUILD,
# então a marca precisa entrar aqui — não dá para trocar depois, na subida do
# container. É o que separa a imagem da plataforma da imagem de uma instalação
# dedicada: mesmo código-fonte, dois builds. Ver apps/web/.env.example.
ARG VITE_PRODUCT_NAME=OManager
ARG VITE_PRODUCT_LOGO=/logo-product.svg
ARG VITE_SHOW_TENANT_BADGE=true
ENV VITE_PRODUCT_NAME=$VITE_PRODUCT_NAME
ENV VITE_PRODUCT_LOGO=$VITE_PRODUCT_LOGO
ENV VITE_SHOW_TENANT_BADGE=$VITE_SHOW_TENANT_BADGE
COPY turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npx turbo run build --filter=web

# ---------------------------------------------------------------------------
# runner — nginx servindo o SPA estático.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runner
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
