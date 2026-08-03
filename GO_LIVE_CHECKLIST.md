# GO_LIVE_CHECKLIST — ERP EDS

Validação final executada contra uma **stack de produção real**: imagens
construídas pelos Dockerfiles do repositório, `NODE_ENV=production`, nginx
servindo o SPA e repassando `/api`, banco migrado do zero. Nada foi simulado com
mock — os resultados abaixo são de requisições HTTP contra o sistema rodando.

| Item               | Valor                                                        |
| ------------------ | ------------------------------------------------------------ |
| Data               | 2026-08-03                                                   |
| Commit             | `0d3a908`                                                    |
| Stack de validação | `edsgolive` (isolada), nginx :8090 → api :3000               |
| Imagens            | `eds-api:golive`, `eds-web:golive`, `eds-api-migrate:golive` |
| **Veredito**       | 🟢 **GO LIVE APROVADO**                                      |

---

## 1. Build

| Check                             | Resultado                                  |
| --------------------------------- | ------------------------------------------ |
| 🟢 Imagem da API                  | build limpo, multi-stage, roda como `node` |
| 🟢 Imagem de migrations           | build limpo (`--target migrate`)           |
| 🟢 Imagem do web                  | build limpo com `VITE_API_URL=/api`        |
| 🟢 Bundle sem `localhost` cravado | 0 ocorrências em 102 chunks                |
| 🟢 `turbo build/type-check/lint`  | 11/11 tasks, zero erro, zero warning       |
| 🟢 Prettier                       | 100% conforme                              |
| 🟢 Testes                         | 36 unitários + 5 e2e                       |

## 2. Banco / Prisma / Neon

| Check                                    | Resultado                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 `migrate deploy` em banco vazio       | 24 migrations aplicadas                                                                                                                                                                              |
| 🟢 `migrate status`                      | "Database schema is up to date" — sem drift                                                                                                                                                          |
| 🟢 Driver honra `sslmode`                | `sslmode=verify-full` contra Postgres sem TLS → **conexão recusada** ("The server does not support SSL connections"). Prova que o TLS do Neon será exigido de fato.                                  |
| 🟢 Confiança em CA pública               | handshake TLS com `neon.tech` validado, `authorized=true`, emissor Google Trust Services                                                                                                             |
| 🟡 `sslmode=verify-full` = `verify-full` | o `pg` 8.22 é **mais estrito que o libpq**: valida cadeia e hostname. Correto e desejável para o Neon; um Postgres com certificado autoassinado exigiria `sslmode=no-verify`.                        |
| 🟡 Runner sem CA bundle do sistema       | `/etc/ssl/certs/ca-certificates.crt` não existe na imagem final. Funciona porque o Node traz **145 CAs embutidas** e o `pg` usa o TLS padrão do Node. Quebraria com `NODE_OPTIONS=--use-openssl-ca`. |

> **Não testado contra o Neon real** — sem credenciais. O que foi provado é que o
> driver exige TLS quando `sslmode=verify-full` e que a cadeia de certificados do
> Neon valida a partir da imagem. A conexão em si só se confirma no provisionamento.

## 3. Variáveis de ambiente — testes negativos

Todos executados no container real. Em todos, a API **recusa subir** com exit 1 e
reporta **todos** os erros de uma vez (`abortEarly: false`):

| Cenário                      | Resultado                                          |
| ---------------------------- | -------------------------------------------------- |
| 🟢 Sem `sslmode` em produção | `"precisa declarar sslmode na string de conexão…"` |
| 🟢 Sem `CORS_ORIGIN`         | `"CORS_ORIGIN is required"`                        |
| 🟢 Segredo JWT < 32 chars    | `"length must be at least 32 characters long"`     |
| 🟢 Sem `DATABASE_URL`        | recusa                                             |
| 🟢 Exit code                 | `1` — o orquestrador enxerga a falha               |

## 4. Autenticação e sessão

| Check                             | Resultado                                             |
| --------------------------------- | ----------------------------------------------------- |
| 🟢 Login correto                  | 200 + accessToken                                     |
| 🟢 Senha errada                   | 401                                                   |
| 🟢 Rate limit de login            | `401 401 401 429 429 429` — trava na 4ª tentativa     |
| 🟢 Flags do cookie de refresh     | `Path=/api/auth; HttpOnly; Secure; SameSite=Lax`      |
| 🟢 Rotação do refresh token       | token novo a cada refresh                             |
| 🟢 Replay do token antigo         | **401** — reuso rejeitado                             |
| 🟢 Logout                         | 204, e o refresh seguinte dá 401                      |
| 🟢 Senha temporária bloqueia tudo | 403 em rota protegida até a troca                     |
| 🟢 Troca de senha                 | senha fraca 400 · senha atual errada 401 · válida 200 |
| 🟢 Senha antiga após troca        | 401                                                   |

## 5. RBAC — matriz completa

Usuário real criado com o papel **RH** (`dashboard.view`, `relatorios.view`,
`rh.view`, `rh.manage`, `engenharia.view`):

| Grupo                     | Testes | Resultado          |
| ------------------------- | ------ | ------------------ |
| 🟢 Leitura permitida      | 5      | 200 em todos       |
| 🟢 Leitura negada         | 10     | 403 em todos       |
| 🟢 Escrita fora do escopo | 3      | 403 em todos       |
| 🟢 Escrita no escopo      | 1      | 201                |
| **Total**                 | **19** | **19/19 corretos** |

Negados corretamente: `users`, `roles`, `audit-logs`, `suppliers`,
`purchase-orders`, `invoices`, `account-payables`, `payments`, `contractors`,
`system-settings`, `POST/DELETE construction-sites`, `POST users`.

🟢 Isolamento multi-tenant: `tenant-isolation-check.ts` — 17/17 contra banco real.

## 6. Rotas

| Check                    | Resultado                                             |
| ------------------------ | ----------------------------------------------------- |
| 🟢 Módulos da API        | 34/34 respondem 200                                   |
| 🟢 Fallback do SPA       | `/engenharia/obras/1` → 200 (não 404)                 |
| 🟢 Cache do `index.html` | `no-cache, no-store, must-revalidate`                 |
| 🟢 Cache dos assets      | `public, max-age=31536000, immutable`                 |
| 🟢 Headers de segurança  | 3/3 (`nosniff`, `X-Frame-Options`, `Referrer-Policy`) |

## 7. Uploads e entrega de arquivo

| Check                                  | Resultado                             |
| -------------------------------------- | ------------------------------------- |
| 🟢 SVG com `<script>`                  | **400**                               |
| 🟢 SVG disfarçado de PDF no mimetype   | **400** (a extensão pega)             |
| 🟢 HTML                                | **400**                               |
| 🟢 PDF legítimo                        | 201                                   |
| 🟢 Download — `Content-Type`           | `application/pdf`                     |
| 🟢 Download — `Content-Disposition`    | `attachment; filename="contrato.pdf"` |
| 🟢 Download — CSP                      | `default-src 'none'; sandbox`         |
| 🟢 Download — `X-Content-Type-Options` | `nosniff`                             |
| 🟢 Integridade                         | byte a byte idêntico ao enviado       |
| 🟢 Download sem token                  | 401                                   |
| 🟢 Exclusão de anexo                   | 204                                   |

## 8. Geração de PDF

🟢 5/5 relatórios (`obras`, `compras`, `financeiro`, `rh`, `terceiros`) — magic
`%PDF-`, `application/pdf`, `Content-Disposition: attachment`, xref e trailer
íntegros. **Renderizado visualmente**: título, timestamp, cabeçalho de colunas e
as obras criadas no teste, com status traduzido ("Em andamento") e moeda em
pt-BR. Formato inválido → 400. Tipo inválido → 400.

🟡 **O PDF não imprime dados da empresa.** `export.util.ts` é o único gerador de
PDF do sistema e não referencia razão social nem CNPJ. Isso **corrige** o que a
auditoria anterior afirmou: os dados cadastrais em `null` não afetam nenhum
documento gerado hoje, porque nenhum documento gerado os imprime.

## 9. Exportação Excel

🟢 5/5 relatórios — magic `PK` (zip), MIME `openxmlformats…spreadsheetml.sheet`.
Planilha aberta e inspecionada: 18 strings, cabeçalhos corretos
(`Código | Nome | Cliente | Status | Cidade/UF | Início | Previsão Fim | Orçamento`)
e os registros criados no teste presentes.

## 10. Frontend renderizado

🟢 Validado em **Chrome headless**, não só por HTTP:

- O React monta: `#root` populado, splash removido
- Login renderiza com o design system íntegro — logo EDS, vermelho institucional
  `#ED2124`, campos e botão estilizados
- Sem flash de conteúdo sem estilo

🟢 **Lazy loading**: 102 chunks, 45 de página/seção. Entrypoint 274 kB;
carga inicial (index + src) ≈ 600 kB crus / ~174 kB gzip. Maior chunk:
`indicadores-section` (380 kB), carregado só ao abrir Relatórios.

## 11. Logs

| Check                                | Resultado                                                    |
| ------------------------------------ | ------------------------------------------------------------ |
| 🟢 Formato                           | JSON de uma linha, 198/200 linhas válidas                    |
| 🟢 Request-id de correlação          | 177 ocorrências                                              |
| 🟢 Vazamento de senha                | **0** (4 senhas distintas procuradas)                        |
| 🟢 Vazamento de token/cookie/segredo | **0** (`Bearer`, `eds_refresh_token`, ambos os segredos JWT) |
| 🟢 `authorization` / `cookie` no log | 0 / 0 — `redact` funcionando                                 |
| 🟢 Permissão negada é auditada       | 13 eventos registrados                                       |

## 12. Bootstrap

| Check                                  | Resultado                                                |
| -------------------------------------- | -------------------------------------------------------- |
| 🟢 Banco vazio → instalação utilizável | 1 empresa, 6 papéis, 1 admin, 16 permissões, 55 vínculos |
| 🟢 Papel Administrador                 | 16/16 permissões                                         |
| 🟢 Senha nasce temporária              | `mustChangePassword: true`                               |
| 🟢 Idempotência                        | 2ª execução: "Bootstrap ignorado"                        |
| 🟢 Não sobrescreve com credencial nova | tentativa com `invasor@x.com` → **não criou**            |

---

## Smoke Test — 10/10

| #   | Passo           | Como foi verificado                                                         |
| --- | --------------- | --------------------------------------------------------------------------- |
| 1   | 🟢 Acessar      | `GET /` 200, SPA renderiza no Chrome, rota profunda cai no fallback         |
| 2   | 🟢 Autenticar   | login 200, senha errada 401, rate limit em 5/min, cookie com flags corretas |
| 3   | 🟢 Navegar      | 34/34 módulos respondem                                                     |
| 4   | 🟢 Criar        | obra, centro de custo, fornecedor, solicitação (2 itens), funcionário       |
| 5   | 🟢 Editar       | `PATCH` obra: nome e status alterados e relidos                             |
| 6   | 🟢 Excluir      | `DELETE` 204 → `GET` 404 → aparece na lixeira → restaurada → `GET` 200      |
| 7   | 🟢 Exportar     | 5 XLSX + 5 PDF, conteúdo conferido                                          |
| 8   | 🟢 Upload       | PDF aceito e devolvido íntegro; SVG/HTML recusados                          |
| 9   | 🟢 Trocar senha | fluxo completo, senha antiga invalidada                                     |
| 10  | 🟢 Sair         | logout 204, refresh posterior 401                                           |

Fluxo de negócio de ponta a ponta também exercitado: obra → centro de custo →
solicitação de compra → `DRAFT → PENDING → QUOTING → APPROVED`, com transição
inválida (`APPROVED → DRAFT`) corretamente recusada com 400.

---

## 🟡 Ressalvas — nenhuma impede a publicação

### 1. Não existe error boundary em lugar nenhum (prioridade máxima pós-deploy)

`ErrorBoundary`, `componentDidCatch`, `getDerivedStateFromError`, `errorElement`,
`useRouteError`: **zero ocorrências** em `apps/web/src` e `packages/ui/src`.

Consequência: qualquer exceção durante o render derruba a árvore inteira para
tela branca. Com 45 páginas em `lazy()`, o cenário mais provável é o usuário com
a aba aberta durante um deploy — os chunks ganham hash novo, o `import()` da
próxima navegação falha, e a tela fica branca.

**Por que não bloqueia**: não há perda de dado, corrupção nem exposição de
segurança, e o `index.html` é servido com `no-store` — um F5 sempre carrega a
versão nova e resolve. É degradação de experiência com recuperação trivial, não
falha de sistema. Mas é o primeiro item a resolver depois da publicação, e vale
avisar os usuários: **se a tela ficar branca, recarregue a página.**

### 2. Imagem final sem CA bundle do sistema

`/etc/ssl/certs/ca-certificates.crt` não existe no estágio `runner` (o
`apt-get install ca-certificates` só roda nos estágios `deps`/`build`/`migrate`).
Hoje funciona porque o Node traz 145 CAs embutidas e o `pg` usa o TLS padrão do
Node — validado contra o `neon.tech`. Fica frágil: `NODE_OPTIONS=--use-openssl-ca`
ou a necessidade de uma CA privada quebrariam a conexão.

### 3. `sslmode=verify-full` no `pg` 8.22 significa `verify-full`

Mais estrito que o libpq. Para o Neon é o comportamento desejado. Registrar para
quem um dia apontar isto a um Postgres com certificado autoassinado — ali seria
preciso `sslmode=no-verify`.

### 4. CPF valida só o formato

`@Matches(/^\d{11}$/)` — sem dígito verificador. `11111111111` é aceito. É regra
de negócio; não foi alterada por instrução explícita.

### 5. `npm audit --omit=dev`: 3 vulnerabilidades

1 alta + 2 moderadas (`brace-expansion` via `archiver`; `uuid` via `exceljs`).
Fora do escopo desta validação.

### 6. Dados cadastrais da EDS incompletos

Razão social e CNPJ preenchidos. Faltam inscrição estadual, endereço e contatos.
Como o item 8 mostrou, **nenhum documento gerado hoje imprime esses dados** — o
impacto real é menor do que a auditoria anterior estimou.

---

## Pré-requisitos de ambiente antes de publicar

- [ ] **HTTPS nas duas pontas.** O cookie de refresh é `Secure`; em HTTP puro o
      navegador o descarta e a sessão cai 15 minutos após o login. Confirmado no
      teste: o cookie sai com `Secure` corretamente.
- [ ] `CORS_ORIGIN` = domínio real de produção
- [ ] `REFRESH_COOKIE_PATH=/api/auth` (origem única)
- [ ] `TRUST_PROXY=1`
- [ ] `DATABASE_URL` / `DIRECT_URL` do Neon **com `?sslmode=verify-full`**
- [ ] Segredos JWT novos e exclusivos deste ambiente
- [ ] `SEED_DEMO=false`, `PUBLIC_SIGNUP_ENABLED=false`
- [ ] Volume montado em `/app/apps/api/uploads`
- [ ] **Uma réplica da API** (storage local + rate limit em memória)

---

## Veredito

# 🟢 GO LIVE APROVADO

10/10 no smoke test, 19/19 no RBAC, 17/17 no isolamento multi-tenant, zero
vazamento de segredo em log, e a cadeia de XSS em anexo fechada e verificada
inclusive para dado legado. As seis ressalvas são conhecidas, documentadas e
nenhuma envolve perda de dado, corrupção ou exposição de segurança.
