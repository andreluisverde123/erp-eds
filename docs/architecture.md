# Arquitetura da Foundation

Plataforma multi-tenant de ERP para construtoras, estruturada como monorepo
gerenciado pelo Turborepo.

## Estrutura

```
apps/
  web/     # React + Vite + TS + Tailwind + Shadcn UI (frontend)
  api/     # NestJS + Prisma (backend)

packages/
  ui/              # Componentes React compartilhados (Shadcn UI)
  types/           # Tipos TypeScript compartilhados entre web e api
  eslint-config/   # Configuração ESLint compartilhada (base, react, nestjs)
  tsconfig/        # tsconfig.json base compartilhados

docs/    # Documentação do projeto
docker/  # Dockerfiles e docker-compose para desenvolvimento/build
```

## Stack

- **Monorepo**: Turborepo + npm workspaces
- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS v4 + Shadcn UI
- **Backend**: NestJS + Prisma ORM
- **Banco de dados**: PostgreSQL via Supabase
- **Qualidade**: ESLint (flat config) + Prettier + Husky + lint-staged

## Convenções

- Pacotes internos são referenciados via workspace (`@repo/ui`, `@repo/types`, `@repo/eslint-config`, `@repo/tsconfig`).
- Cada app/pacote possui seu próprio `eslint.config.js` (ou `.mjs`) que estende a config compartilhada.
- Cada app/pacote estende um tsconfig base de `@repo/tsconfig` (`vite-app.json`, `react-library.json`, `nestjs.json`, `base.json`).
- Variáveis de ambiente ficam em `.env` (nunca commitado) com `.env.example` como referência.

## Rodando o projeto

```bash
npm install
npm run dev     # roda web (5173) e api (3000) em paralelo via Turborepo
npm run build   # build de produção de todos os apps/pacotes
npm run lint    # lint em todo o monorepo
npm run format  # formata todo o código com Prettier
```

## Próximos passos (fora do escopo desta etapa)

- Modelagem do schema Prisma (entidades do domínio de construtoras).
- Autenticação (Supabase Auth / JWT).
- Telas e fluxos de negócio no `apps/web`.
- Endpoints e regras de negócio no `apps/api`.
