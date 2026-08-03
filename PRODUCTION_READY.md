# PRODUCTION_READY — ERP EDS

Auditoria de prontidão para produção e registro das correções aplicadas.

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| Auditoria   | 2026-08-02                                                 |
| Correções   | 2026-08-02 (mesma sessão)                                  |
| Alvo        | Neon (Postgres) + containers `api` / `web`                 |
| Bloqueantes | 5 encontrados · **4 resolvidos** · 1 parcial               |
| Veredito    | **APTO PARA PRODUÇÃO**, com uma pendência de dado (ver B5) |

Escopo das correções: apenas os itens 🔴. Nenhuma regra de negócio foi alterada
e nenhuma funcionalidade nova foi introduzida — as mudanças são de configuração,
segurança de entrega de arquivo e caminho de instalação.

---

## Placar

| Área                      | 🟢     | 🟡     | 🔴    |
| ------------------------- | ------ | ------ | ----- |
| Build / TypeScript / lint | 6      | 0      | 0     |
| Banco e migrations        | 6      | 1      | 0     |
| Frontend                  | 5      | 3      | 0     |
| Backend                   | 8      | 2      | 0     |
| Segurança                 | 13     | 3      | 0     |
| Performance               | 3      | 4      | 0     |
| Código / dependências     | 6      | 3      | 0     |
| Deploy / operação         | 9      | 1      | 0     |
| **Total**                 | **56** | **17** | **0** |

Antes das correções: 46 🟢 · 20 🟡 · 5 🔴.

---

## Bloqueantes — o que era e o que ficou

### 🟢 B1 — Não havia caminho para criar o primeiro usuário — **RESOLVIDO**

**Era:** o seed de produção (`SEED_DEMO=false`) retornava logo após popular a
tabela `Permission`. Sem `Company`, sem `Role`, sem `User`. O único bootstrap
era `POST /onboarding/signup`, fechado por `PUBLIC_SIGNUP_ENABLED` (env) e por
`VITE_PUBLIC_SIGNUP_ENABLED` (build-arg — abrir a tela custaria um rebuild da
imagem web). Migrate + seed + up entregava um sistema saudável e inacessível.

**Ficou:** `apps/api/prisma/seed/bootstrap.ts`, acionado por
`BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD`. Cria a empresa, os 6
papéis padrão e o administrador, numa transação.

Decisões que valem registro:

- **Reaproveita `DEFAULT_ROLES`/`DEFAULT_PERMISSIONS`** de
  `src/common/tenancy/default-roles.ts` — a mesma fonte do onboarding
  self-service e do seed de demonstração. Uma empresa criada pelo bootstrap é
  indistinguível de uma criada por qualquer outro caminho, que era exatamente o
  motivo de aquele arquivo existir.
- **Senha nasce temporária** (`mustChangePassword: true`). Ela passou por um
  arquivo de ambiente; o `PasswordChangeGuard` bloqueia tudo até a troca.
- **Idempotente**: se já existe qualquer usuário, não faz nada. Rodar o seed de
  novo num sistema em uso não ressuscita um admin com senha de um `.env` antigo.
- **Valida a senha antes de tocar o banco**, com a mesma regra do `SignupDto`
  (8–72, ao menos uma letra e um número) — o bootstrap não podia ser a única
  porta capaz de gravar uma senha mais fraca do que a aplicação aceita.
- **Não lê `EDS_COMPANY`** de `@repo/types`. Aquele objeto é a identidade da
  _aplicação_ (aba, splash, login), e o próprio arquivo pede para não confundi-lo
  com o registro `Company` do banco. Copiar um no outro criaria duas fontes para
  o mesmo dado, divergindo no primeiro `PATCH /company`. A razão social entra
  provisória, como no onboarding, e é completada em Configurações → Empresa.

**Verificação executada** (banco criado do zero):

```
migrate deploy                    → 24 migrations aplicadas
db seed com BOOTSTRAP_*           → 1 Company, 6 Role, 1 User, 16 Permission, 55 RolePermission
                                    Administrador com as 16 permissões
db seed de novo                   → "Bootstrap ignorado: o banco já tem usuário cadastrado."
senha sem dígito / curta / só e-mail → falha antes de tocar o banco, com mensagem própria
```

E o ciclo completo contra a API rodando:

```
POST /auth/login                  → 200, accessToken emitido
GET  /construction-sites          → 403 (senha temporária bloqueia)
POST /auth/change-password        → 200, mustChangePassword: false
GET  /construction-sites          → 200
```

**Regressão fechada:** o job `e2e` do CI passou a definir as variáveis de
bootstrap, e `test/app.e2e-spec.ts` ganhou o teste que faltava — "o
administrador criado pelo seed consegue fazer login". Era o único cenário que
todos os outros testes deixavam passar: healthcheck ok, 401 correto na rota
protegida, e o sistema inutilizável.

---

### 🟢 B2 — O código auditado não estava no Git — **RESOLVIDO**

**Era:** HEAD em `f246eca Initial commit`, 265 arquivos pendentes, incluindo
`packages/types/src/company.ts` (não rastreado) e 228 arquivos de `dist-eds/`
ainda no índice. Um `clone` + `build` entregava o app anterior — com a marca
"Foundation" e, o mais grave, **sem o guard de `PUBLIC_SIGNUP_ENABLED`** no
`/onboarding/signup`, ou seja, criação pública de empresa aberta na internet.

**Ficou:** `dist-eds/` removido do índice (`git rm -r --cached`) e todo o
trabalho commitado. `git status` limpo — o que está no HEAD é o que foi
auditado e corrigido.

---

### 🟢 B3 — XSS armazenado via anexos — **RESOLVIDO**

**Era** uma cadeia de quatro elos: upload sem filtro de tipo → extensão herdada
do `originalname` → `mimeType` gravado com o valor declarado pelo cliente →
devolvido com esse mesmo tipo, inline, na mesma origem do SPA e sem CSP.

**Ficou:** `apps/api/src/common/uploads/attachment-content.ts`, aplicado nos dois
pontos de upload vulneráveis (`attachments` e `workflow/attachments` — este
segundo tinha `fileFilter`, mas só checava entidade e permissão, não o arquivo)
e no `FilesController`.

A correção principal é **na entrega**, não no upload:

| Antes                           | Agora                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `res.type(attachment.mimeType)` | tipo escolhido pela aplicação; fora da lista inerte, `application/octet-stream` |
| sem `Content-Disposition`       | `attachment; filename="…"`, com o nome saneado                                  |
| sem CSP (helmet desligado)      | `default-src 'none'; sandbox` na resposta                                       |
| sem `nosniff` nessas rotas      | `X-Content-Type-Options: nosniff`                                               |

Isso é o que **protege também os anexos que já estão no banco** — arquivos
enviados antes da correção continuam lá, com o `mimeType` do atacante gravado.
Um filtro de upload sozinho não faria nada por eles.

O filtro de upload é defesa em profundidade, e é **lista de bloqueio, não de
permissão**, de propósito: uma construtora anexa projeto, planilha, foto de obra
e arquivo de CAD, e uma lista fechada transformaria o campo de anexo num
formulário restrito — mudança de comportamento que a auditoria não pediu.
Bloqueia só o que carrega código ativo (`.svg`, `.html`, `.xhtml`, `.xml`,
`.js`, `.swf` e os mimetypes correspondentes), checando extensão **e** mimetype
independentemente.

**Verificação executada** contra a API rodando:

```
upload ataque.svg              (image/svg+xml)  → 400
upload ataque.svg disfarçado   (application/pdf) → 400   ← extensão pega
upload ataque.html             (text/html)      → 400
upload contrato.pdf            (application/pdf) → 201

entrega do PDF legítimo:
  Content-Type: application/pdf
  Content-Disposition: attachment; filename="contrato.pdf"
  Content-Security-Policy: default-src 'none'; sandbox
  X-Content-Type-Options: nosniff
  sem token → 401

anexo LEGADO (linha inserida direto no banco com mimeType image/svg+xml,
nome de arquivo `ataque"; x.svg` tentando injeção de header):
  Content-Type: application/octet-stream        ← neutralizado
  Content-Disposition: attachment; filename="ataque__ x.svg"   ← aspas removidas
  Content-Security-Policy: default-src 'none'; sandbox
```

Regressão do logo conferida: continua inline, com `Content-Type: image/png`
derivado da extensão (necessário porque o `nosniff` impede o navegador de
adivinhar e o front busca o logo como blob). SVG como logo segue recusado pela
regra que já existia.

Coberto por `attachment-content.spec.ts` — 20 casos.

---

### 🟢 B4 — Configuração era de Supabase, não de Neon — **RESOLVIDO**

**Era:** `.env.example`, `docs/deploy.md` e o compose descreviam Supabase (porta
6543, `pgbouncer=true`, Supavisor). E o essencial: a aplicação conecta por
`PrismaPg` → `pg` 8.22, que **só liga TLS se `sslmode` estiver na string**. Uma
URL montada a partir do exemplo do repositório não conecta no Neon.

**Ficou:**

- **`env.validation.ts` exige `sslmode` declarado quando `NODE_ENV=production`**,
  nas duas URLs. A regra pede uma _decisão_, não um valor: `sslmode=require` num
  banco gerenciado, `sslmode=disable` num Postgres da própria rede
  (`--profile local-db`). O que não passa é omitir. Sem essa regra o modo de
  falha era ruim dos dois lados — erro de conexão sem causa aparente no Neon,
  ou boot silencioso com credenciais em texto puro num banco permissivo.
- **`.env.example` reescrito** com os três formatos reais (Neon, Postgres da
  própria rede, Supabase), explicando que no Neon o pooler é o mesmo host com
  sufixo `-pooler` na porta 5432 — não há porta separada.
- **`docs/deploy.md`** atualizado: tabela de peças, seção de env, comando de
  migrations e nova seção 3b (seed e primeiro acesso).
- **Scale-to-zero**: `HEALTHCHECK` da imagem da API passou de
  `--start-period=25s --timeout=5s` para `40s`/`10s`. O cold start do Neon
  levava a readiness a falhar e marcar o container unhealthy no primeiro deploy
  de baixa atividade.

Verificado por `env.validation.spec.ts` (6 casos): produção sem `sslmode` em
qualquer uma das duas URLs é recusada; o formato do Neon passa; `sslmode=disable`
passa; fora de produção não é exigido; URL não-Postgres continua recusada.

Já era compatível e foi confirmado: `pg_trgm` está na lista de extensões
permitidas do Neon e os índices GIN funcionam; `pgbouncer=true` residual é
ignorado pelo `pg` (é parâmetro de engine do Prisma, não do driver).

---

### 🟡 B5 — Dados cadastrais da EDS — **PARCIALMENTE RESOLVIDO**

**Preenchido** em `packages/types/src/company.ts`:

| Campo       | Valor                                                      |
| ----------- | ---------------------------------------------------------- |
| `legalName` | `E D S Construcoes e Imobiliaria Ltda`                     |
| `cnpj`      | `05534927000125` (05.534.927/0001-25 — dígitos conferidos) |

**Ainda `null`** — e é o que rebaixa este item a 🟡 em vez de fechá-lo:

- `stateRegistration` (inscrição estadual)
- `address` inteiro: logradouro, número, complemento, bairro, cidade, UF, CEP
- `contacts`: e-mail, telefone, site

Consequência prática: ordem de compra, relatório e holerite agora **identificam
a empresa legalmente** (razão social + CNPJ), mas saem **sem endereço e sem
canal de contato**. Nenhuma tela quebra — todos os consumidores tratam `null`
como "não exibir", e `formatCompanyAddress` devolve `null` quando não há nada.

Uma decisão que ficou registrada no código e merece sua confirmação: o **nome
fantasia registrado** é `E D S Construcoes e Imobiliaria` (grafia da Receita,
sem acento, iniciais separadas), mas `tradeName` foi mantido como
`EDS Construtora`, que é o que aparece no rodapé da barra lateral via
`COMPANY_NAME`. Documento usa `legalName`; tela usa `tradeName`. Se preferir que
a tela mostre a grafia oficial, é uma linha.

---

## 🟡 Atenção — o que segue aberto (nenhum impede o deploy)

Inalterados desde a auditoria, salvo onde indicado.

### Frontend

1. **Nenhum error boundary em toda a aplicação.** `ErrorBoundary`,
   `componentDidCatch`, `errorElement`, `useRouteError` — zero ocorrências. Com
   26 páginas `lazy()`, uma falha de chunk (rotineira para quem estava com a aba
   aberta durante um deploy) dá tela branca sem recuperação. **É o 🟡 de maior
   impacto no dia a dia; recomendo ser o próximo item.**
2. **RBAC de rota cobre só `/configuracoes`.** URL direta abre qualquer outra
   página; o backend recusa cada chamada, então não há vazamento — o usuário vê
   uma tela montada com erros.
3. **`VITE_API_URL` cai para `localhost:3000` em silêncio** se o build-arg for
   esquecido (`api-client.ts:1` e `web.Dockerfile`).

### Segurança

4. **Rate limit é por instância** (`ThrottlerModule` sem storage externo). Com N
   réplicas, 5 logins/min viram 5×N. Hoje o compose sobe 1 réplica.
5. **JWT sem revogação.** Desativar usuário ou remover permissão só surte efeito
   quando o access token expira (até 15 min). O refresh é rotacionado e
   revogável.
6. **3 vulnerabilidades em dependências de produção** (1 alta, 2 moderadas):
   `brace-expansion` via `archiver`/`zip-stream`/`readdir-glob` e `uuid <11.1.1`
   via `exceljs`. `npm audit fix` resolve as primeiras sem quebrar nada; a do
   `uuid` exige downgrade quebrante do `exceljs`. **Deixado fora de propósito —
   o escopo pedido era 🔴, e mexer no lockfile merece decisão sua.**
7. **HTTPS é obrigatório e nada verifica isso no boot.** Cookie `Secure` em
   produção: em HTTP puro o login "funciona" e a sessão morre em 15 min.

### Performance

8. **Indicadores leem tabelas inteiras.** `indicators.service.ts`: 11 `findMany`
   sem `take`; `expensesBySite` e `contractsSummary` sem janela de data.
9. **Chunk de relatórios: 380 kB (108 kB gzip)**, recharts. É lazy. Carregamento
   inicial ≈ 174 kB gzip, que está bom.
10. **`STORAGE_DRIVER=local` não sobrevive a duas réplicas** — documentado, mas
    nada impede `--scale api=2`.

### Código e dependências

11. **`nodemailer` e `@aws-sdk/s3-request-presigner` sem uso** — zero
    importações, peso morto na imagem.
12. **`scripts/scoped-where-check.ts` não verifica nada** — sai
    `0/0 verificações passaram`. Confiança falsa.
13. **Cobertura de teste ainda concentrada em infraestrutura.** Subiu de **1
    para 36 testes unitários** (+ 5 e2e) nesta sessão, mas o que ganhou cobertura
    foi o que estas correções tocaram: conteúdo de anexo e validação de ambiente.
    `financeiro/` e `rh/payslips/` continuam sem nenhum teste — é onde priorizar.

---

## 🟢 Verificação final

Executada com o working tree no estado entregue.

| Check                       | Comando                                | Resultado                        |
| --------------------------- | -------------------------------------- | -------------------------------- |
| Build (do zero)             | `turbo run build --force`              | ✅ 3/3 tasks                     |
| Type-check                  | `turbo run type-check --force`         | ✅ 5/5 pacotes, zero erro TS     |
| Lint (`--max-warnings 0`)   | `turbo run lint --force`               | ✅ 4/4 pacotes                   |
| Formatação                  | `npm run format:check`                 | ✅ 100% conforme                 |
| Testes unitários            | `turbo run test --force`               | ✅ 36/36 (3 suítes)              |
| E2E (Postgres + migrations) | `jest --config test/jest-e2e.json`     | ✅ 5/5, incluindo login do admin |
| Isolamento multi-tenant     | `scripts/tenant-isolation-check.ts`    | ✅ 17/17 contra banco real       |
| `console.log` / `FIXME`     | grep em `apps/*/src`, `packages/*/src` | ✅ 0 / 0                         |
| Vulnerabilidades (prod)     | `npm audit --omit=dev`                 | 🟡 3 (1 alta, 2 moderadas)       |

Migrations: 24 aplicadas do zero num banco vazio, sem drift.

---

## Arquivos alterados

**Novos**

- `apps/api/prisma/seed/bootstrap.ts` — B1
- `apps/api/src/common/uploads/attachment-content.ts` — B3
- `apps/api/src/common/uploads/attachment-content.spec.ts` — B3
- `apps/api/src/config/env.validation.spec.ts` — B4

**Modificados**

- `apps/api/prisma/seed.ts` — orquestra o bootstrap (B1)
- `apps/api/test/app.e2e-spec.ts` — teste de login do admin (B1)
- `.github/workflows/ci.yml` — variáveis de bootstrap no job e2e (B1)
- `apps/api/src/attachments/attachments.controller.ts` — `fileFilter` (B3)
- `apps/api/src/workflow/attachments/workflow-attachments.controller.ts` — idem (B3)
- `apps/api/src/files/files.controller.ts` — entrega segura (B3)
- `apps/api/src/config/env.validation.ts` — `sslmode` obrigatório (B4)
- `apps/api/.env.example` — Neon + bootstrap (B4/B1)
- `docker/api.Dockerfile` — healthcheck para cold start (B4)
- `docker/docker-compose.prod.yml` — Neon (B4)
- `docs/deploy.md` — Neon, seção 3b, correção de 3 afirmações falsas (B1/B4)
- `packages/types/src/company.ts` — razão social e CNPJ (B5)

---

## O que não foi verificado

- **Não houve deploy real no Neon.** As correções de B4 foram validadas por
  teste da regra de validação e por leitura do driver — não por uma conexão
  executada contra o Neon.
- **Regras de negócio não foram tocadas nem auditadas** — foi instrução
  explícita nas duas etapas.
- **Nenhum teste de carga.** Os apontamentos de performance seguem sendo leitura
  de código e do relatório de bundle.
- **Responsividade não verificada em navegador.**
- Os testes de B1 e B3 rodaram contra um Postgres local descartável, criado e
  removido no processo. A lógica é a mesma em produção; a infraestrutura não.
