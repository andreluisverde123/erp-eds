# Web

Interface do ERP: React 19 + TypeScript, Vite, React Router e TanStack
Query, com o design system em [`packages/ui`](../../packages/ui).

Para a visão geral do sistema veja [PROJECT_SCOPE.md](../../PROJECT_SCOPE.md);
para arquitetura, [docs/architecture.md](../../docs/architecture.md).

## Rodar

```bash
cp .env.example .env   # aponte VITE_API_URL para a API
npm run dev            # http://localhost:5173
```

A API precisa estar no ar — veja [apps/api](../api/README.md).

## Marca da instalação

O sistema é o mesmo para todas as construtoras; cada instalação tem a própria
marca, numa pasta em [`brands/`](brands):

```
brands/<id>/
  brand.json    nome do sistema, nome curto, construtora, descrição e cores
  logo.svg      assinatura horizontal (barra lateral, login, splash)
  favicon.svg   símbolo quadrado (aba do navegador, ícone do app)
```

O build escolhe a pasta pela variável `VITE_BRAND` (padrão `eds` em
desenvolvimento, testes e CI; **obrigatória** no `docker/web.Dockerfile`). O
plugin [`brand/vite-plugin.ts`](brand/vite-plugin.ts) aplica a marca no
`index.html` (título, meta tags, splash e cores), gera o
`manifest.webmanifest` e publica os logos em `/brand/`. No código, a marca
chega por [`src/config/company.ts`](src/config/company.ts).

Nenhum nome de construtora deve ser escrito direto em componente ou página.

Nome e logo editáveis pelo administrador (Configurações → Sistema/Empresa) vêm
do banco a cada login e têm precedência sobre a marca da instalação. A regra
está em [`use-brand.ts`](src/features/auth/use-brand.ts).

Cliente novo: copie `brands/eds/` para `brands/<cliente>/`, troque os três
arquivos e publique com `VITE_BRAND=<cliente>`.

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
