# Plano de evoluções

Backlog acumulado desde o início do projeto: cada módulo, ao ser entregue,
deixou anotado o que ficou deliberadamente fora de escopo. Este documento
organiza tudo em fases executáveis.

**Execução em andamento desde 27/07/2026.** Itens riscados estão entregues e
verificados; os demais seguem pendentes. Cada item concluído registra o que
mudou e onde — vale rediscutir prioridade antes de cada fase.

Legenda de esforço: **P** = até meio dia · **M** = 1 a 2 dias · **G** = 3 dias ou mais.

---

## Fase 1 — Fechar o cerco multi-tenant

O isolamento de dados já está provado (17/17 no `apps/api/scripts/tenant-isolation-check.ts`).
O que falta é o entorno: criar, suspender e cobrar clientes. **Esta fase é o
que destrava o segundo cliente** — as demais podem esperar.

| #       | Item                                                                                                                                                                                                                                                                                                    | Onde                                 | Esforço |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------- |
| ~~1.1~~ | ~~**Onboarding de empresa**~~ — **feito (27/07)**: `POST /onboarding/signup` cria Company (`TRIAL`/`STARTER`) + 6 papéis + admin numa transação e devolve a sessão; tela em `/cadastro`. Papéis e permissões viraram fonte única em `src/common/tenancy/default-roles.ts`, compartilhada com o seed.    | `src/onboarding/`, `pages/cadastro/` | —       |
| ~~1.2~~ | ~~**E-mail único por empresa**~~ — **descartado (27/07, decisão do produto)**: um e-mail = uma empresa é o comportamento desejado. Quem atua em duas construtoras usa dois e-mails, e cada um abre o ambiente da sua empresa. Sem subdomínio por tenant e sem seletor de empresa no login.              | —                                    | —       |
| ~~1.3~~ | ~~**Status da empresa no login**~~ — **feito (27/07)**: `assertCompanyActive` em login, refresh e `/auth/me`. `ACTIVE` e `TRIAL` entram; `SUSPENDED`/`CANCELLED`/`deletedAt` levam 403 com mensagem própria. Como roda também no refresh, suspender derruba sessão aberta em até 15 min.                | `auth.service`                       | —       |
| ~~1.4~~ | ~~**Defesa em profundidade**~~ — **feito (27/07)**: as 44 ocorrências de `where: { id }` em update/delete passaram a repetir o escopo do tenant (`companyId` direto, ou `employee`/`contract`/`accountPayable: { companyId }` nos filhos). O filtro global agora traduz `P2025` para 404 em vez de 500. | todos os services                    | —       |
| 1.5     | **Convite de usuário por e-mail** (hoje o admin cria com senha temporária mostrada na tela) — depende do envio real de e-mail (item 5.1).                                                                                                                                                               | `configuracoes/users`                | M       |

## Fase 2 — Governança de acesso

| #       | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Onde                                             | Esforço         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| ~~2.1~~ | ~~**Split `.access` → leitura/escrita**~~ — **feito (27/07)**: 7 permissões viraram 13 (`<módulo>.view` + `<módulo>.manage` para engenharia, compras, financeiro, rh e terceiros). Migration `split_module_permissions` converte os papéis existentes sem ninguém ganhar ou perder acesso.                                                                                                                                                                                   | `default-roles.ts`, 20 controllers, migration    | —               |
| ~~2.2~~ | ~~**Permissão dedicada de Terceiros**~~ — **feito (27/07)**: `terceiros.view`/`terceiros.manage`, saindo de `engenharia.access`.                                                                                                                                                                                                                                                                                                                                             | idem                                             | —               |
| ~~2.3~~ | ~~**Restaurar soft delete**~~ — **feito (27/07)**: em vez de 17 endpoints e 17 telas, um catálogo (`src/trash/trash-entities.ts`) + `GET /trash` + `POST /trash/:entityType/:id/restore`, e a aba **Lixeira** em Configurações. Restaurar desfaz o mangling do campo único (`OBRA-1__deleted__<uuid>` → `OBRA-1`) e recusa com 409 se o valor já tiver sido reaproveitado.                                                                                                   | `src/trash/`, `sections/lixeira-section.tsx`     | —               |
| 2.4     | **Alçadas de aprovação** — **parcialmente feito (27/07)**. Entregue: alçada por VALOR em Compras (aprovar solicitação) e Financeiro (registrar pagamento), com limite por empresa em Configurações → Sistema (`0` = desligada) e as permissões `compras.approve`/`financeiro.approve`. **Falta**: aprovação de ponto/produção/holerite no RH, que não é por valor — exige `approvedAt`/`approvedById` novos em `TimeEntry`/`ProductionEntry`/`Payslip` e telas de aprovação. | ✔ `common/approval/`, Compras, Financeiro · ✗ RH | M (o que resta) |
| ~~2.5~~ | ~~**`mustChangePassword`**~~ — **feito (27/07)**: flag no `User`, ligada quando um admin cria usuário ou reseta senha. `PasswordChangeGuard` bloqueia toda a API (exceto `/auth/me`, `/auth/change-password` e logout) até a troca, e `POST /auth/change-password` devolve sessão nova e revoga as antigas. Tela `/trocar-senha` é obrigatória no primeiro acesso.                                                                                                           | schema + `auth` + `pages/trocar-senha`           | —               |

## Fase 3 — Anexos e configurações que valem de verdade

| #       | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Onde                                                           | Esforço         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| ~~3.1~~ | ~~**Driver S3 de storage**~~ — **feito (27/07)**: `src/storage/` com dois drivers (`local` padrão, `s3` compatível com AWS/MinIO/R2/Supabase). Uploads passaram de `diskStorage` para memória + `StorageService`; os arquivos continuam servidos pela API, com as mesmas checagens de permissão. Testado ponta a ponta contra um MinIO em container. Sem migração de dados: o banco guarda o caminho, não a localização física.                                           | `src/storage/`, 4 controllers de upload, `files.controller.ts` | —               |
| ~~3.2~~ | ~~**Padronizar `Attachment`**~~ — **feito (27/07)**: `src/attachments/` com catálogo de 10 entidades (obra, solicitação, ordem, fornecedor, nota, conta a pagar, pagamento, funcionário, terceiro, contrato) e um endpoint só (`GET/POST/DELETE /attachments/:entityType/:entityId`). Anexar exige `<módulo>.manage` (o endpoint antigo do workflow pedia só `.view`) e valida que o registro é da empresa. `AttachmentsPanel` reutilizável ligado em Obra e Solicitação. | `src/attachments/`, `features/anexos/`                         | —               |
| 3.3     | **`SystemSettings` consumido** — **parcialmente feito (27/07)**: `allowAttachments` e `maxUploadSizeMb` passam a valer em TODOS os caminhos de upload (`UploadPolicyService`), e as alçadas do item 2.4 também leem as configurações. **Falta**: `auditEnabled` (desligar auditoria) e `notificationsEnabled`, que dependem do módulo de e-mail.                                                                                                                          | ✔ uploads · ✗ auditoria/notificações                           | P (o que resta) |
| ~~3.4~~ | ~~**Dropzone nos uploads restantes**~~ — **feito (27/07)**: holerite (RH) e logo da empresa (Configurações) passaram a aceitar arrastar-e-soltar, com o mesmo `FileDropzone` já usado em Terceiros. Todos os pontos de upload do sistema aceitam arrastar arquivo.                                                                                                                                                                                                        | `apps/web`                                                     | —               |

## Fora do plano — entregue a pedido (28/07)

| Item                                     | O que mudou                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Menu por permissão**                   | Os 15 itens do menu passaram a declarar a permissão que exigem (`<módulo>.view`). A sidebar já sabia esconder item sem permissão e ocultar grupo vazio — faltava só declarar.                                                                                                                                                                                       |
| **Perfis padrão restritos ao escopo**    | Cada papel nasce com o próprio módulo + o que precisa para operar: Compras consulta Engenharia (obra/centro de custo na solicitação), Financeiro consulta Compras (ordem que origina a nota), RH consulta Engenharia (alocação em obra). Antes todos liam todos os módulos. Vale para tenants NOVOS e para quem rodar o seed; empresas existentes mantêm o que têm. |
| **Seed passou a sincronizar permissões** | Antes o seed só somava: reduzir o escopo de um papel padrão não tinha efeito e sobravam permissões de versões anteriores. Agora remove o que saiu do template.                                                                                                                                                                                                      |

## Fase 4 — Fluxos de negócio que faltam

| #    | Item                                                                                                                                                           | Onde                   | Esforço |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| 4.1  | **Medições de contrato** (Terceiros): `ContractorContract.totalValue` é valor fechado; obra longa paga por medição periódica. Modelar `ContractMeasurement[]`. | schema + Terceiros     | G       |
| 4.2  | **Progresso físico da obra**: hoje "evolução" é estimativa por cronograma (tempo decorrido). Progresso real depende de medição por etapa — mesmo eixo do 4.1.  | schema + Relatórios    | G       |
| 4.3  | **Recebimento de mercadoria**: `PurchaseOrder` tem status RECEIVED no enum e nada o popula — falta a tela de conferência de entrega.                           | Compras                | M       |
| 4.4  | **Cotações de fornecedor**: "Em Cotação" é só um rótulo; não há propostas comparáveis antes da aprovação.                                                      | Compras                | G       |
| ~~4.5~~ | ~~**Itens na Ordem de Compra**~~ — **feito (23/08)**: `PurchaseOrderItem` com vínculo obrigatório à linha da solicitação, total da OC derivado dos itens e PDF do pedido. Ver `docs/ordem-de-compra.md`. | schema + Compras       | —       |
| 4.6  | **Parcelamento de contas a pagar**: cada `AccountPayable` é uma parcela única; falta 2/3, 3/3 na validação da nota.                                            | Financeiro             | M       |
| 4.7  | **Retenções contratuais** (5% até entrega, INSS/ISS) e **integração fiscal** de terceiros.                                                                     | Terceiros + Financeiro | G       |
| 4.8  | **Renovação de contrato**: `ContractStatus` só tem ACTIVE/CANCELLED; vencido só ganha badge.                                                                   | Terceiros              | P       |
| 4.9  | **Horas extras e adicional noturno**: `TimeEntry.hoursWorked` é a diferença bruta saída−entrada.                                                               | RH                     | M       |
| 4.10 | **Folha de pagamento calculada** (INSS/IRRF/benefícios) e **eSocial**: hoje `Payslip` só registra valores informados por fora.                                 | RH                     | G       |
| 4.11 | **Holerites recorrentes**: gerar rascunhos mensais para ativos, em vez de criar um a um.                                                                       | RH                     | P       |
| 4.12 | **Conciliação bancária**: `Payment.method` viraria referência a conta bancária cadastrada.                                                                     | Financeiro             | G       |
| 4.13 | **Telas de edição faltantes**: `ContractDocument`/`ContractEmployee` só criam e excluem; contrato não edita depois de criado (só via API).                     | Terceiros              | M       |
| 4.14 | **Responsável da obra como usuário real**: `ConstructionSite.responsibleName` é texto livre; virar relação com `User` e um picker.                             | Engenharia             | P       |

## Fase 5 — Notificações

> **Atenção**: `nodemailer` e `@types/nodemailer` já foram instalados em
> `apps/api` (28/07), mas **nenhum código os usa ainda** — o módulo de e-mail
> foi interrompido antes de começar. Ou o 5.1 continua, ou as duas
> dependências devem ser removidas.

| #   | Item                                                                                                                                                                                        | Onde                      | Esforço |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| 5.1 | **Envio real de e-mail** (`channelEmail` hoje é só preferência armazenada). Habilita também o convite de usuário (1.5).                                                                     | novo módulo de mail       | M       |
| 5.2 | **Alertas de vencimento** de contrato e documento de terceiro: os cards são visuais e dependem do usuário abrir o sistema. Registrar `contract.expiring` no catálogo `NOTIFICATION_EVENTS`. | Terceiros + Configurações | M       |
| 5.3 | **WhatsApp/Push**: colunas já existem em `NotificationPreference`, UI mostra os toggles desabilitados com badge "Em breve".                                                                 | —                         | G       |

## Fase 6 — Produtividade (estender o que já existe)

A infraestrutura foi construída e provada só no módulo Obras. Estender é
repetição mecânica (~15-20 linhas por tabela), em ~21 tabelas.

| #   | Item                                                                                                                 | Esforço |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------- |
| 6.1 | Seleção múltipla + ações em lote (`useRowSelection`/`useBulkDelete`/`BulkActionsBar`) nas demais listagens           | M       |
| 6.2 | Colunas configuráveis (`useColumnVisibility`) e filtros salvos (`useSavedFilters`) nas demais listagens              | M       |
| 6.3 | Duplicar registro e exportação CSV rápida nas demais telas                                                           | P       |
| 6.4 | Favoritar entidades além de Obra (o hook `useFavorites` já é genérico; falta o botão de estrela)                     | P       |
| 6.5 | Breadcrumbs nas demais rotas (hoje só Obras)                                                                         | P       |
| 6.6 | Telas de detalhe para Funcionário/Fornecedor/Terceiro/OC/Nota — hoje a busca global cai na listagem, não no registro | G       |

## Fase 7 — Escala e saúde técnica

| #   | Item                                                                                                                                                                         | Onde                    | Esforço |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------- |
| 7.1 | **Índices trigram/GIN** para as ~18 buscas `ILIKE` (hoje sequential scan em toda busca por texto). Exige `CREATE EXTENSION pg_trgm` + índice por campo, via migration SQL.   | migration               | M       |
| 7.2 | **Exportação assíncrona**: hoje até 5.000 linhas síncronas (`MAX_EXPORT_ROWS`); acima disso precisa de job em background + download posterior.                               | Relatórios              | G       |
| 7.3 | **Métricas materializadas**: indicadores recalculam tudo a cada abertura de aba.                                                                                             | Relatórios              | G       |
| 7.4 | **33 vulnerabilidades transitivas** (`exceljs`, `archiver`, tooling do Prisma). `npm audit fix --force` derruba major do exceljs — exige validar exportação xlsx/pdf depois. | raiz                    | M       |
| 7.5 | **Imagem da API com 1,07 GB** (Prisma 7 arrasta CLI, studio-core e engines para as deps de produção).                                                                        | `docker/api.Dockerfile` | M       |
| 7.6 | **Prettier na base inteira** (261 arquivos divergem) + religar `format:check` no CI.                                                                                         | raiz                    | P       |
| 7.7 | **Fallback de favicon** (.ico/PNG/apple-touch-icon) — exige um rasterizador de SVG.                                                                                          | `apps/web/public`       | P       |

## Fase 8 — Design system

| #   | Item                                                                                                           | Esforço |
| --- | -------------------------------------------------------------------------------------------------------------- | ------- |
| 8.1 | `Skeleton` de carregamento (hoje `LoadingState` é texto simples)                                               | P       |
| 8.2 | Company box no rodapé da sidebar (logo + nome da construtora) — exige expor nome/logo da empresa no `AuthUser` | M       |
| 8.3 | Revisar dark mode (`globals.css`, bloco `.dark`) — nunca foi validado contra a referência do Figma             | M       |
| 8.4 | Escala tipográfica de 12px no app inteiro (hoje só a sidebar segue a referência)                               | M       |
| 8.5 | Validar variantes `warning`/`info` do Badge contra a referência                                                | P       |

---

## Já resolvido — não replanejar

Itens que estavam no backlog e foram concluídos ou superados por outra
abordagem:

- **Papéis de sistema protegidos** — `Role.isSystem`, com bloqueio de exclusão/renomeação.
- **Auditoria em todos os módulos** — resolvida por uma Prisma Client Extension genérica (`common/prisma/audit-extension.ts`), não pela chamada manual módulo a módulo que o backlog previa.
- **Lazy loading por rota** — `router.tsx` inteiro convertido para `React.lazy` (~21 páginas).
- **Permissão dedicada de Relatórios** — `relatorios.view` criada e aplicada nos 3 controllers.
- **`EmptyState`/`ErrorState`/`LoadingState` compartilhados** — criados em `@repo/ui` e aplicados nas ~24 duplicações.
- **Integração Compras → Financeiro** — a cadeia PurchaseOrder → Invoice → AccountPayable existe.

## Decisões que o plano assume

1. **Ordem**: Fase 1 primeiro, porque é a única que bloqueia colocar um segundo
   cliente no ar. As Fases 2 e 3 são pré-requisito para vender o sistema como
   produto (governança e anexos). Da Fase 4 em diante é profundidade de
   domínio, e pode ser reordenada pelo que o cliente pedir.
2. **O que não entra**: nada aqui muda o modelo de dados de forma destrutiva
   sem migration reversível — os itens que mexem em `@unique` (1.2) e em
   valores de contrato (4.1, 4.7) precisam de plano de migração de dados à
   parte.
3. **Verificação**: cada item deve ser reconferido contra o código no momento
   de executar. Os desta lista foram conferidos em 27/07/2026 (permissões,
   ausência de endpoints de restore, uso real de `Attachment`, ausência de
   criação de empresa, storage sem S3).
