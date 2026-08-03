# DEPLOYMENT_CHECKLIST — ERP EDS

Lista operacional do primeiro deploy em produção (Neon + containers).
O diagnóstico completo e o registro das correções estão em
[`PRODUCTION_READY.md`](./PRODUCTION_READY.md).

**Situação: nenhum bloqueante aberto.** Resta uma pendência de dado cadastral
(B5) que não impede a subida — ver Fase 0.

Legenda: 🟢 pronto/verificado · 🟡 atenção (não impede) · 🔴 bloqueante

---

## Fase 0 — Bloqueantes

- [x] 🟢 **B1 · Bootstrap do primeiro usuário**
      `apps/api/prisma/seed/bootstrap.ts`, acionado por `BOOTSTRAP_ADMIN_EMAIL` +
      `BOOTSTRAP_ADMIN_PASSWORD`. Cria empresa, 6 papéis e o admin com senha
      temporária. Idempotente. Verificado em banco vazio e coberto pelo e2e do CI.

- [x] 🟢 **B2 · Código no Git**
      `dist-eds/` fora do índice, working tree commitado, `git status` limpo.

- [x] 🟢 **B3 · XSS armazenado nos anexos**
      Entrega endurecida no `FilesController` (Content-Type escolhido pela
      aplicação, `Content-Disposition: attachment`, CSP `sandbox`, `nosniff`) e
      filtro de conteúdo ativo nos dois pontos de upload. Protege inclusive os
      anexos já existentes no banco.

- [x] 🟢 **B4 · Configuração para Neon**
      `sslmode` obrigatório em produção (falha no boot sem ele), `.env.example`
      e runbook no formato Neon, healthcheck com folga para cold start.

- [ ] 🟡 **B5 · Completar os dados cadastrais da EDS**
      Preenchidos: razão social e CNPJ. **Faltam** inscrição estadual, endereço
      completo e contatos, em `packages/types/src/company.ts`.
      Documentos saem identificados legalmente, mas sem endereço e sem contato.
      Não impede o deploy — impede que a papelada saia completa.

---

## Fase 1 — Ambiente

- [ ] Projeto criado no Neon, região definida, scale-to-zero decidido
- [ ] `DATABASE_URL` = endpoint **com** `-pooler`, **com `?sslmode=require`**
- [ ] `DIRECT_URL` = mesmo endpoint **sem** `-pooler`, **com `?sslmode=require`**
      🟢 A API se recusa a subir se qualquer uma das duas omitir `sslmode`
- [ ] `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` (`openssl rand -base64 48`),
      diferentes entre si e exclusivos deste ambiente
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` = domínio real (obrigatória em produção)
- [ ] `TRUST_PROXY=1` (nginx na frente)
- [ ] `REFRESH_COOKIE_PATH=/api/auth` (origem única)
- [ ] `PUBLIC_SIGNUP_ENABLED=false` — 🟢 o bootstrap não depende mais dele
- [ ] `SEED_DEMO=false` — nunca `true` em produção
- [ ] `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` definidas **só para o
      primeiro seed**; remover depois
- [ ] `LOG_LEVEL=info`
- [ ] `STORAGE_DRIVER` decidido — 🟡 `local` só funciona com 1 réplica
- [ ] TLS ativo nas duas pontas — 🟡 sem HTTPS o cookie `Secure` é descartado
- [ ] 🟢 `.env` de produção fora do Git

---

## Fase 2 — Build

Todos verificados no estado entregue:

- [x] 🟢 `npx turbo run lint --force` — 4/4 pacotes, zero warning
- [x] 🟢 `npx turbo run type-check --force` — 5/5, zero erro TS
- [x] 🟢 `npx turbo run build --force` — 3/3, build limpo do zero
- [x] 🟢 `npm run format:check` — 100% conforme
- [x] 🟢 `npx turbo run test --force` — 36/36
- [ ] 🟡 `npm audit --omit=dev` — 3 vulnerabilidades (1 alta, 2 moderadas);
      `npm audit fix` resolve as de `brace-expansion`. Deixado fora do escopo 🔴.
- [ ] `docker build -f docker/api.Dockerfile -t eds-api .`
- [ ] `docker build -f docker/web.Dockerfile --build-arg VITE_API_URL=/api -t eds-web .`
      🟡 `VITE_API_URL` é assado no bundle; sem o build-arg a imagem aponta para
      `localhost:3000` em silêncio
- [ ] `docker build -f docker/api.Dockerfile --target migrate -t eds-api-migrate .`

---

## Fase 3 — Banco e primeiro acesso

- [x] 🟢 24 migrations + `migration_lock.toml`, aplicadas do zero sem drift
- [ ] Branch do Neon antes de aplicar
- [ ] **Migrations** — sempre antes de subir a API, nunca no boot:
      `docker run --rm -e DIRECT_URL="…?sslmode=require" eds-api-migrate`
- [ ] 🟢 Confirmar `pg_trgm` e os índices GIN
- [ ] **Seed com bootstrap** — numa instalação nova, as variáveis de bootstrap
      são o que cria empresa, papéis e admin:
      `docker run --rm -e DATABASE_URL="…" -e DIRECT_URL="…" -e BOOTSTRAP_ADMIN_EMAIL="…" -e BOOTSTRAP_ADMIN_PASSWORD="…" --entrypoint sh eds-api-migrate -c "npx prisma db seed"`
- [ ] Conferir no banco: 1 `Company`, 6 `Role`, 1 `User` com
      `mustChangePassword: true`, 16 `Permission`
- [ ] Remover `BOOTSTRAP_ADMIN_PASSWORD` do ambiente

---

## Fase 4 — Subida

- [ ] `docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d`
- [ ] `GET /health/liveness` → 200
- [ ] `GET /health/readiness` → 200 (confirma o Neon alcançável **e** o TLS)
- [ ] `GET /health` → banco + heap + RSS
- [ ] Rota protegida sem token → 401
- [ ] `docker compose ps` — containers `healthy`
      🟢 `start-period` de 40s já acomoda o cold start do Neon
- [ ] 🟡 **Não escalar a API** enquanto `STORAGE_DRIVER=local` e o rate limit for
      em memória

---

## Fase 5 — Validação funcional

- [ ] Login com o admin do bootstrap
      🟢 fluxo verificado: login → 403 nas rotas → troca de senha → acesso pleno
- [ ] Sessão sobrevive **além de 15 minutos** — pega `REFRESH_COOKIE_PATH`
      errado, cookie sem `Secure` e CORS mal configurado de uma vez só
- [ ] F5 numa rota profunda (`/engenharia/obras/<id>`) não dá 404
- [ ] Criar obra → solicitação → ordem de compra
- [ ] **Upload e download de anexo**
      🟢 verificado: `.svg`/`.html` recusados com 400; PDF aceito e devolvido
      como download com CSP e `nosniff`; logo segue inline e funcional
- [ ] Relatórios abrem — 🟡 rota mais cara da API
- [ ] Usuário sem permissão não vê o item na sidebar
      🟡 mas consegue abrir a URL direta (backend recusa)
- [ ] 🟡 Erro de render hoje resulta em **tela branca** — não há error boundary
- [ ] Telas principais em viewport móvel (não coberto pela auditoria)

---

## Fase 6 — Pós-deploy

- [ ] Variáveis de bootstrap removidas do ambiente
- [ ] `PUBLIC_SIGNUP_ENABLED=false` confirmado
- [ ] Logs em JSON, com request-id, sem senha ou token
- [ ] Volume de uploads montado e persistindo entre deploys
- [ ] Backup do Neon definido
- [ ] Rollback escrito (imagem anterior + estado das migrations)

Fila técnica sugerida, em ordem de impacto:

1. 🟡 **Error boundary global** + fallback para falha de chunk lazy — é o 🟡 que
   mais aparece para o usuário
2. 🟡 **Completar B5** (inscrição estadual, endereço, contatos)
3. 🟡 `npm audit fix`
4. 🟡 Testes de `financeiro/` e `rh/payslips/`
5. 🟡 `RequirePermission` nas demais rotas
6. 🟡 Remover `nodemailer` e `@aws-sdk/s3-request-presigner`
7. 🟡 Corrigir `scripts/scoped-where-check.ts` (`0/0 verificações`)

---

## Resumo

| Fase            | Estado                                   |
| --------------- | ---------------------------------------- |
| 0 · Bloqueantes | 🟢 4 resolvidos · 🟡 1 parcial (B5)      |
| 1 · Ambiente    | ⏳ a preencher no provisionamento        |
| 2 · Build       | 🟢 verificado, passa limpo               |
| 3 · Banco       | 🟢 caminho de bootstrap pronto e testado |
| 4 · Subida      | 🟢 infra pronta                          |
| 5 · Validação   | ⏳ no ambiente real                      |
| 6 · Pós-deploy  | ⏳                                       |

**O sistema está apto para o primeiro deploy em produção.** Os 17 itens 🟡
restantes são dívida conhecida e documentada; nenhum impede a subida.
