# Onboarding — banco de dados

Guia de entrada para quem vai trabalhar no banco da plataforma. Leia a seção
"A regra que não pode ser quebrada" antes de tocar em qualquer coisa.

## O que é este sistema

ERP para construtoras. Monorepo com duas aplicações:

- `apps/api` — NestJS + Prisma, dona do schema e das migrations
- `apps/web` — React (Vite), só consome a API

O banco é PostgreSQL 16. Em desenvolvimento roda em Docker; nos ambientes
publicados é um Postgres gerenciado (Supabase).

## A regra que não pode ser quebrada

**O banco não é a fonte da verdade — `apps/api/prisma/schema.prisma` é.**

Nada de `CREATE TABLE`, `ALTER TABLE` ou `CREATE INDEX` direto no banco, nem
em desenvolvimento. Toda mudança estrutural segue este caminho:

1. edite `apps/api/prisma/schema.prisma`
2. rode `npx prisma migrate dev --name descricao_curta` (de dentro de `apps/api`)
3. confira o `.sql` gerado em `apps/api/prisma/migrations/`
4. commite schema + migration juntos, no mesmo commit

Por que isso importa: o Prisma compara o schema declarado com o histórico de
migrations. Uma alteração feita à mão existe no seu banco e em lugar nenhum
mais — o `migrate` seguinte detecta a divergência (_drift_), e a correção
costuma ser destrutiva. Em produção, o deploy simplesmente falha.

Quando o SQL que o Prisma gera não dá conta (índice parcial, extensão,
trigger, `CONCURRENTLY`), o caminho é `npx prisma migrate dev --create-only`:
ele cria a migration vazia, você escreve o SQL na mão e aplica depois. Há
exemplos disso no repositório — veja `20260727160000_enable_pg_trgm` e
`20260725014012_add_performance_indexes`.

## Subindo o ambiente

Pré-requisitos: Node 20+, Docker, npm.

```bash
git clone <url-do-repositorio> eds
cd eds
npm install

# variáveis de ambiente (os .env NÃO são versionados)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

No `apps/api/.env`, aponte para o Postgres local e defina os dois segredos de
JWT (qualquer string longa serve em desenvolvimento):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eds"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/eds"
JWT_ACCESS_SECRET="qualquer-coisa-com-mais-de-32-caracteres-aqui"
JWT_REFRESH_SECRET="outra-coisa-com-mais-de-32-caracteres-aqui"
```

`DATABASE_URL` é a conexão que a aplicação usa (em produção passa por pooler,
porta 6543); `DIRECT_URL` é a conexão direta que o `prisma migrate` exige. Em
desenvolvimento as duas apontam para o mesmo lugar.

Então:

```bash
docker compose -f docker/docker-compose.yml up -d   # Postgres na 5432
cd apps/api
npx prisma migrate dev                              # cria o schema
SEED_DEMO=true npx prisma db seed                   # catálogo + demonstração
```

O seed tem duas partes, e a distinção importa:

- **catálogo** (`prisma/seed/catalog.ts`): as 16 permissões do produto. Tabela
  global, roda sempre, inclusive em produção.
- **demonstração** (`prisma/seed/demo.ts`): uma empresa-vitrine com dados de
  exemplo em todos os módulos e seis usuários de senha conhecida. **Só roda com
  `SEED_DEMO=true`.**

Sem a variável, `prisma db seed` sincroniza apenas o catálogo — é o que
qualquer ambiente publicado deve executar. Em desenvolvimento você quer os dois.

Os usuários da demonstração são `admin@`, `engenharia@`, `compras@`,
`financeiro@`, `rh@` e `diretoria@`, todos com a senha impressa no fim do seed.

Para rodar o sistema: `npm run dev` na raiz (API em `:3000`, web em `:5173`).

## Como o schema está organizado

`apps/api/prisma/schema.prisma`, dividido por módulo de negócio:

| Módulo         | Models principais                                                           |
| -------------- | --------------------------------------------------------------------------- |
| Tenancy / auth | `Company`, `User`, `Role`, `Permission`, `RolePermission`                   |
| Engenharia     | `ConstructionSite`, `CostCenter`                                            |
| Compras        | `Supplier`, `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseOrder`       |
| Financeiro     | `Invoice`, `AccountPayable`, `Payment`                                      |
| RH             | `Employee`, `EmployeeAllocation`, `TimeEntry`, `ProductionEntry`, `Payslip` |
| Terceirizados  | `Contractor`, `ContractorContract`, `ContractDocument`, `ContractEmployee`  |
| Transversal    | `AuditLog`, `Attachment`, `NotificationPreference`                          |

Quatro convenções valem para quase todas as tabelas:

- **Multi-tenant por coluna.** Quase todo model tem `companyId`, e toda query
  filtra por ele. Não existe schema por cliente. Ao criar tabela nova, inclua
  `companyId` e o índice correspondente.
- **Soft delete.** `deletedAt DateTime?`. Registro "excluído" continua na
  tabela; as queries filtram `deletedAt: null`. Códigos únicos (`code`) são
  embaralhados na exclusão (`mangleDeletedCode`) para liberar o valor.
- **Dinheiro é `Decimal`**, nunca `Float`. Chega no JSON como string — sempre
  converta antes de calcular.
- **Busca textual usa índices trigram** (`pg_trgm`), porque os filtros são
  `contains` + `insensitive`, que viram `ILIKE`. Sem eles a tabela é varrida
  inteira a cada tecla digitada.

## O que não está resolvido

Pontos conhecidos, se você quiser por onde começar:

- **Agregações em JS.** Vários indicadores (`apps/api/src/relatorios/indicators/`)
  fazem `groupBy`/`findMany` e somam em JavaScript. Funciona no volume atual;
  não escala.
- **Sem particionamento nem política de retenção** em `AuditLog`, que cresce
  para sempre.
- **`PurchaseRequest.constructionSiteId` é derivado** de `CostCenter` e pode ser
  nulo. Materializado na linha de propósito, porque relatórios agrupam por obra —
  mas isso é desnormalização, e a coerência depende do service.
- **`docs/plano-evolucoes.md`** tem o backlog técnico completo, incluindo a fase
  de escala e saúde técnica.

## Fluxo de trabalho

- `main` é protegida: nada entra sem Pull Request.
- Toda migration passa por revisão antes do merge — ela é irreversível em
  produção.
- O CI (`.github/workflows/ci.yml`) roda lint, type-check e build em cada PR.
- Não existe migration de _rollback_. Se algo precisa ser desfeito, é uma
  migration nova que desfaz.

## Acessos

Este repositório **não contém credencial de nenhum ambiente publicado** — os
`.env` são ignorados pelo Git e só os `.env.example` são versionados. Acesso ao
banco de demonstração ou de produção, se necessário, é concedido à parte.
