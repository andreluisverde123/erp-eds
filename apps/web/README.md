# Web

Interface do ERP EDS: React 19 + TypeScript, Vite, React Router e TanStack
Query, com o design system em [`packages/ui`](../../packages/ui).

Para a visão geral do sistema veja [PROJECT_SCOPE.md](../../PROJECT_SCOPE.md);
para arquitetura, [docs/architecture.md](../../docs/architecture.md).

## Rodar

```bash
cp .env.example .env   # aponte VITE_API_URL para a API
npm run dev            # http://localhost:5173
```

A API precisa estar no ar — veja [apps/api](../api/README.md).

## Identidade

Nome, logo, dados cadastrais e cores de marca da EDS vivem em um lugar só:
`EDS_COMPANY`, em [`packages/types/src/company.ts`](../../packages/types/src/company.ts).
A API lê a mesma constante. Nenhum nome de empresa deve ser escrito direto em
componente ou página.

Duas coisas ficam de fora dessa constante e são intencionais:

- **Nome e logo editáveis pelo administrador** (Configurações → Sistema/Empresa)
  vêm do banco a cada login e têm precedência sobre a constante. A regra está em
  [`use-brand.ts`](src/features/auth/use-brand.ts).
- **Título, meta tags, manifest e splash** ficam em [`index.html`](index.html) e
  [`public/manifest.webmanifest`](public/manifest.webmanifest): são servidos
  antes de qualquer JavaScript, então repetem os valores literalmente.

## Estrutura

```
src/
  components/   componentes compartilhados entre telas (sidebar, dashboard)
  config/       identidade da empresa e navegação
  features/     lógica por domínio: hooks, chamadas de API, componentes
  layouts/      casca autenticada da aplicação
  pages/        uma pasta por rota
  lib/          cliente HTTP e utilitários
```

Rotas são declaradas em [`src/router.tsx`](src/router.tsx) e derivam de
[`src/config/nav.ts`](src/config/nav.ts) — incluir um item na navegação já cria
a rota. Cada item carrega a permissão que o backend exige no módulo
correspondente; a checagem no front é só para não anunciar tela que o usuário
não pode abrir.

## Scripts

| Comando              | O que faz                       |
| -------------------- | ------------------------------- |
| `npm run dev`        | servidor de desenvolvimento     |
| `npm run build`      | build de produção em `dist/`    |
| `npm run lint`       | ESLint, zero warnings tolerados |
| `npm run type-check` | TypeScript sem emitir arquivos  |
