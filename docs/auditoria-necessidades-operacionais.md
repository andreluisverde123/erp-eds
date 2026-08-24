# Auditoria — necessidades operacionais levantadas com o cliente

**Data:** 23/08/2026 · **Escopo:** mapear o estado atual dos 12 pontos levantados
e propor ordem de implementação. **Nenhum código, schema ou dado foi alterado.**

Complementa `docs/plano-evolucoes.md` (backlog geral) e
`docs/plano-integracao-fiscal.md` (integração NF-e). Onde um item já estava
catalogado ali, a referência é citada em vez de duplicada.

---

## 1. Ordem de Compra

| Ponto verificado | Situação | Onde |
| --- | --- | --- |
| Geração da OC | **Existe.** Exige solicitação `APPROVED`, código sequencial `OC-n`. | `compras/purchase-orders/purchase-orders.service.ts:25` |
| Cálculo automático do valor | **Não existe.** `totalAmount` é digitado à mão. | `create-purchase-order.dto.ts`, drawer "informe o valor negociado" |
| Geração de PDF | **Não existe.** | — |
| Itens × fornecedores | **Não existe.** A OC não tem model de itens. | schema, `model PurchaseOrder` |
| Múltiplos fornecedores na OC | **Não existe.** `supplierId` é obrigatório e único. | schema |
| Rastreabilidade até a Solicitação | **Parcial.** Documento sim, item não. | `PurchaseOrder.purchaseRequestId` |

**Detalhamento.**

A OC é hoje um cabeçalho: fornecedor, valor total, data de emissão, previsão de
entrega. Os itens vivem só em `PurchaseRequestItem` e não são copiados nem
referenciados. O valor estimado da solicitação (`quantity × estimatedUnitPrice`,
calculado em `calculateEstimatedTotal`) existe e é exibido na tela da
solicitação, mas **não é levado à OC nem sugerido no formulário** — o comprador
digita o valor negociado do zero.

`pdfkit` está instalado e em uso, porém apenas para exportação tabular de
relatórios (`relatorios/reports/export.util.ts`). Não há documento de OC para
enviar ao fornecedor — a infraestrutura existe, o documento não.

"Múltiplos fornecedores na mesma OC" tem duas leituras, e elas levam a
implementações opostas:

- **(i) uma OC com itens de fornecedores diferentes** — quebra a semântica do
  documento: a OC é o pedido que se envia *a um* fornecedor. Um PDF com três
  fornecedores não é enviável.
- **(ii) uma solicitação que se divide em várias OCs, uma por fornecedor** — é o
  caso real de obra (o pedido de material vai para quem tem cada item), e o
  schema **já suporta**: `PurchaseRequest.purchaseOrders` é lista. O que falta é
  saber *qual item* foi para *qual OC*, e isso volta ao mesmo ponto: itens na OC.

Recomendação: confirmar (ii) com o cliente. Já registrado como item 4.5 do
backlog.

---

## 2. Fluxo de Compras

**Fluxo real, ponta a ponta:**

```
Solicitação (SOL-n)          DRAFT → PENDING → QUOTING → APPROVED → (CANCELLED)
  └ itens: descrição, unidade, quantidade, preço unitário estimado
      ↓  cotação = grava estimatedUnitPrice nos MESMOS itens (compras.manage)
Ordem de Compra (OC-n)       1 solicitação · 1 fornecedor · valor DIGITADO
      ↓
Nota Fiscal ─ dois caminhos:
   (a) POST /financeiro/invoices        → exige purchaseOrderId
   (b) Conciliação de InboundInvoice    → cria a Invoice (com OU sem OC)
      ↓
Conta a Pagar   (a) validar nota = 1 parcela, vencimento +30d
                (b) conciliação  = N parcelas conforme PaymentTerms
      ↓
Pagamento (parcial ou total)
```

**Onde a rastreabilidade se perde — quatro cortes, em ordem de gravidade:**

1. **Solicitação → OC, no nível do item.** O corte principal. Não existe
   `PurchaseOrderItem`; a partir da OC o sistema só conhece um valor agregado.
   Tudo que depende de item (conferência de entrega, conciliação por item,
   histórico de preço por material, PDF do pedido) fica inalcançável.
2. **OC → NF, no nível do item.** `InboundInvoiceItem` existe e vem completo do
   XML (código do emitente, NCM, CFOP, CST), mas não tem vínculo com item de OC
   nem de solicitação. A conferência é por **valor total**, com tolerância de 10%
   e janela de 90 dias (`reconciliation.util.ts`).
3. **Compra de balcão.** Nota conciliada sem OC ancora a despesa no centro de
   custo. Não há origem em solicitação — por definição, não houve.
4. **Solicitação parcialmente comprada.** Uma solicitação aceita N ordens, mas
   sem itens não há como saber o que já foi comprado nem qual saldo resta.
   Nada controla isso hoje.

No nível de **documento** a cadeia se mantém íntegra
(`SOL → OC → Invoice → AccountPayable → Payment`), exceto no caminho balcão.
No nível de **item**, ela termina na solicitação.

**Também observado:** "Em Cotação" é só um rótulo de estágio — não há propostas
de fornecedores diferentes para comparar (backlog 4.4). E o status `RECEIVED` da
OC existe no enum sem nada que o popule (backlog 4.3).

---

## 3. Engenharia → Financeiro

Permissões do perfil Engenharia: `engenharia.view/manage`, `terceiros.view/manage`,
`compras.view`, `compras.request`, `dashboard.view`.

| A Engenharia consegue informar… | Situação |
| --- | --- |
| Valor | **Parcial.** `estimatedUnitPrice` por item, opcional, e só enquanto a solicitação é rascunho. A cotação (`updateQuote`) exige `compras.manage`. |
| Fornecedor | **Não.** Fornecedor só entra na OC, que é ato de Compras. |
| Vencimento | **Não.** |
| Forma de pagamento | **Não.** |
| Destino do pagamento | **Não.** |

**Como essas informações chegam ao Financeiro hoje:** apenas pelo documento.
Engenharia abre a solicitação → Compras cota, aprova e emite a OC → Financeiro
encontra a OC ao lançar a nota ou ao conciliar. **Não existe canal para a
Engenharia transmitir condições de pagamento.** Os únicos campos livres são
`PurchaseRequest.notes` e `WorkflowComment` — texto, não dado estruturado, e
nada no Financeiro os lê.

Achados que importam para o desenho:

- **`PurchaseRequest.neededBy` é coluna morta.** Existe no schema, não aparece em
  nenhum DTO nem em nenhuma tela (`grep` sobre `apps/` só encontra tipos
  gerados). Além disso é "data de necessidade", não vencimento.
- **Forma de pagamento nasce tarde.** `PaymentMethod` (PIX/cartão/dinheiro/boleto)
  só existe no DTO de conciliação — ou seja, é escolhida pelo Financeiro no fim
  do processo, não informada por quem pediu.
- **"Destino do pagamento" não tem onde ser gravado.** Não há um único campo
  bancário no schema inteiro (ver item 9). `Supplier` não tem banco, agência,
  conta nem chave PIX.

---

## 4. Conta a Pagar sem Ordem de Compra

**O Financeiro consegue criar uma Conta a Pagar diretamente? Não.**
`CreateAccountPayableDto.invoiceId` é obrigatório, o service valida a existência
da nota, e `AccountPayable.invoiceId` é `NOT NULL` no banco.

**Mas já consegue conta a pagar sem *ordem de compra*:** a conciliação com
`purchaseOrderId` nulo + `costCenterId` (compra de balcão) cria a `Invoice` e as
parcelas. É o caminho aberto em 06/08.

Inconsistência existente que vale corrigir junto: `POST /financeiro/invoices`
**ainda exige `purchaseOrderId` no DTO**, embora a coluna já seja opcional. O
lançamento manual de nota sem OC é impossível pela API, só pela conciliação.

**O que seria necessário para Conta a Pagar realmente avulsa:**

1. `AccountPayable.invoiceId` → opcional (`DROP NOT NULL`; migration aditiva e
   reversível, sem perda de dados).
2. **Ancoragem própria**, porque hoje a AP não tem nenhuma: acrescentar
   `supplierId`, `costCenterId`/`constructionSiteId` e `description` na própria
   `AccountPayable`. Ela herda tudo da nota — inclusive nas consultas.
3. **Revisar todo lugar que assume `invoice` não-nulo**, e são vários:
   `includeArgs` faz join em `invoice.supplier`; o filtro por fornecedor é
   `invoice: { supplierId }`; a busca textual passa pela nota; o `summary`; as
   telas de Contas a Pagar; os relatórios financeiros; a busca global.
4. Alçada: `financeiro.manage` já cobre a criação. Vale avaliar estender a
   alçada por valor (hoje só existe em registrar pagamento) para a AP avulsa —
   é o caminho que nasce sem nota conferida.

Este item é **pré-requisito do item 7 (boletos)** e da terceira modalidade de
conciliação.

---

## 5. Fornecedores

| Ponto | Situação |
| --- | --- |
| Cadastro manual | **Existe.** CRUD completo, soft delete com mangling do documento. |
| Criação automática a partir da NF-e | **Não existe.** |
| Identificação por CNPJ | **Existe.** `@@unique([companyId, document])`. |
| Prevenção de duplicidade | **Parcial — com defeito.** |

A importação fiscal apenas **busca** o fornecedor por documento e deixa
`supplierId` nulo quando não acha (`fiscal-import.service.ts:205`). Há um único
`supplier.create` em todo o sistema, no caminho manual. A criação automática está
registrada como decisão em aberto no plano fiscal (item 2.1: 98 emitentes
distintos na fila; se for feita, "criar só no ato da conciliação, não na
importação").

**Defeito encontrado — normalização assimétrica de CNPJ.**
`SuppliersService.create` grava `dto.document` **sem normalizar**. O DTO valida
só tamanho (`MaxLength(20)`). Já `InboundInvoice.supplierDocument` é sempre
`onlyDigits`, e o parser de NF-e usa `digits()`. Consequências:

- `12.345.678/0001-90` e `12345678000190` convivem como **dois fornecedores** — o
  unique é sobre o texto, não sobre o CNPJ.
- Um fornecedor cadastrado com máscara **nunca casa** com as notas importadas: a
  busca da conciliação compara com o CNPJ só-dígitos.

A correção é pequena (normalizar na entrada + migration de dados) mas precisa de
uma contagem prévia em staging para saber quantos registros estão mascarados.
Consulta somente leitura.

---

## 6. Conciliação

**Arquitetura atual:** `InboundInvoice` (documento como chegou, emitente
desnormalizado) → `reconcile()` → numa transação única cria `Invoice` já
`VALIDATED` + N `AccountPayable` + marca a nota. A `Invoice` é o que conecta o
módulo ao financeiro existente, sem escrever em contas a pagar por fora.

**Modalidades que já existem** — as duas dentro do mesmo método, por ramo `if (order)`:

1. **NF × Ordem de Compra.** Valida mesmo fornecedor, saldo em aberto da OC
   (total − já conciliado), divergência com aceite explícito. Sugestões
   pontuadas por `scoreCandidate` (70% valor, 30% data).
2. **NF sem Ordem de Compra.** Exige `costCenterId`; a obra é derivada dele.

Ambas exigem fornecedor cadastrado (`Invoice.supplierId` é `NOT NULL`).

**Modalidades que não existem:**

3. **Conta a Pagar direta (sem NF)** — bloqueada pelo item 4.
4. **Conciliação por item** (NF × itens da OC) — não há o que casar (item 1).
5. **Rateio** — uma nota entre várias OCs ou vários centros de custo. Uma OC
   aceita várias notas até esgotar o saldo, mas o inverso não existe.
6. **Boleto × NF/AP** — item 7.
7. **Desfazer conciliação** — `reconciledAt`/`invoiceId` são "gravados e nunca
   mais alterados"; `cancel` só vale antes de conciliar.

**Está preparada para novas modalidades? Meio.** O ponto de extensão é claro
(um método, uma transação, DTO com campos opcionais), mas `reconcile()` já
concentra duas modalidades em ramos condicionais e passa de 200 linhas. Uma
terceira e uma quarta dentro do mesmo `if` ficam insustentáveis.

**Recomendação (sem mudar comportamento nem banco):** antes de acrescentar
modalidade, transformar o DTO numa união discriminada
(`mode: 'PURCHASE_ORDER' | 'COST_CENTER' | 'DIRECT'`) e extrair um resolvedor por
modalidade que devolva `{ supplierId, costCenterId, constructionSiteId, divergência }`.
A montagem da `Invoice` + parcelas continua uma só. Refactor puro, cabe como
primeiro passo do item.

---

## 7. Boletos

**Infraestrutura de upload: existe, e é reaproveitável quase inteira.**

- `src/storage/` com dois drivers (local e S3-compatível), `StorageService.saveUpload`.
- `Attachment` polimórfico + catálogo `ATTACHMENT_ENTITIES`, que **já inclui
  `AccountPayable` e `Invoice`**: `POST /attachments/AccountPayable/:id` funciona hoje.
- `attachment-content.ts` bloqueia conteúdo ativo e serve `application/pdf` inline;
  `UploadPolicyService` aplica `allowAttachments`/`maxUploadSizeMb`.

**Leitura de boleto: não existe nada.** Sem parser de linha digitável, sem OCR,
sem dependência instalada.

**Melhor forma de implementar depois — fatiar em duas entregas:**

- **Entrega 1, sem OCR.** Campo "linha digitável" digitado ou colado + parser
  puro (padrão FEBRABAN: 47 posições em boleto de cobrança, 48 em arrecadação;
  DV por módulo 10/11; fator de vencimento sobre a base 07/10/1997, já no
  ciclo pós-2025; valor nas 10 últimas posições). Código determinístico,
  testável sem infraestrutura, e já entrega **valor + vencimento** — que é o que
  o Financeiro precisa.
- **Entrega 2.** Extração a partir do PDF: `pdf-parse`/`pdfjs` para PDF com
  camada de texto (a maioria dos boletos bancários). OCR só depois, e só para
  PDF escaneado — ler o código de barras como imagem é o caminho caro.
- **Fluxo:** upload como `Attachment` da entidade destino → parse → tela de
  conferência **pré-preenchida** → confirmação humana obrigatória → cria/atualiza
  a `AccountPayable`. Nunca gravar sem confirmação: linha digitável errada é
  pagamento errado.
- **Onde guardar:** campos novos em `AccountPayable` (`barcodeLine`,
  `payeeDocument`), não em `Attachment`.
- **Dependência dura:** item 4. Boleto de despesa avulsa não tem nota nem ordem;
  sem AP avulsa ele não tem onde aterrissar.

---

## 8. Acesso por Obra

**RBAC atual.** `Permission` (código texto livre, catálogo global, `module` +
`action`) → `RolePermission` → `Role` (por empresa, `isSystem` protege os do
seed) → `UserRole`. Papéis e permissões viram **snapshot dentro do JWT**;
`PermissionsGuard` exige o AND das permissões da rota, O(1), sem ida ao banco.
O escopo de dados é o tenant: **154 pontos** de controller passam
`@CurrentUser('companyId')` ao service, e cada service filtra
`where: { companyId, deletedAt: null }`.

**É possível somar "Perfil + Obras permitidas"? Sim** — o desenho combina com o
que existe. Mas é a mudança de **maior alcance** de toda a lista. O que ela exige:

1. **Tabela `UserConstructionSite`** (`userId`, `constructionSiteId`, unique).
   Aditiva, não toca em nada existente.
2. **Semântica do conjunto vazio — a decisão mais importante do item.** Lista
   vazia *tem* que significar "todas as obras". Se significar "nenhuma", todo
   usuário existente perde acesso no deploy da migration, e Diretoria/Admin
   precisariam ser reassociados a cada obra nova.
3. **Propagação.** O filtro precisa alcançar tudo que tem obra, direta ou
   indiretamente: **79 ocorrências** de `constructionSiteId` em services, mais o
   que só chega à obra por travessia — `PurchaseOrder`, `Invoice`,
   `AccountPayable` (via `invoice.costCenter`), `Payment` (dois níveis abaixo),
   `TimeEntry`, `ProductionEntry`, `EmployeeAllocation`, relatórios, busca
   global, dashboard.
4. **O buraco dos nulos.** Registros com `constructionSiteId` nulo (centro de
   custo administrativo, nota de balcão) somem para todo mundo se o filtro for
   ingênuo. Precisa de regra explícita.
5. **Onde vive o escopo.** A lista de obras cabe no JWT pelo mesmo argumento dos
   papéis. Mas, ao contrário das permissões, ela **não se resolve no guard**: o
   guard barra rota, aqui se filtra linha. O lugar natural é o mesmo do
   `companyId` — escopo passado ao service, injetado por interceptor para não
   repetir a decisão em 36 controllers.
6. **Escrita também.** Criar solicitação para obra não permitida tem de ser
   recusado; esconder da listagem não basta.

**Depende da decisão do item 10/11**: o que se filtra depende do que "obra" passa
a significar.

---

## 9. Banco de funcionários

**Não existe absolutamente nada.** `Employee` tem `id`, `companyId`, `name`,
`cpf`, `position`, `status`, `hireDate`, `terminationDate`, `baseSalary`. A busca
por campos bancários em todo o schema retorna apenas os valores do enum
`PaymentMethod` e `Payment.method` (string livre, sem estrutura).

O que existe de adjacente: `Payslip` (bruto/descontos/líquido/`paidAt`) registra
o valor, não o destino; e `Employee` está no catálogo de anexos — dá para anexar
comprovante hoje.

**Quando for implementar (não agora), o que já precisa estar decidido:**

- É **dado pessoal financeiro (LGPD)**. Chave PIX, banco, agência e conta pedem
  permissão própria (`rh.bank_data`) — hoje `rh.view` mostra tudo de RH.
- Precisa ficar **fora** dos exports de relatório e das listagens.
- `AuditLog.changes` grava JSON do que mudou: **precisa de mascaramento** ali,
  senão a conta bancária vaza pelo histórico.
- A mesma modelagem serve ao fornecedor (item 3, "destino do pagamento"). Vale
  decidir de uma vez: entidade `BankAccount` polimórfica, ou dois conjuntos de
  campos.

---

## 10. Centro de Custo

**Como está.** Entidade própria: `companyId`, `code` (único por empresa), `name`,
`constructionSiteId` **opcional**. Relação **1 obra : N centros de custo**, mais
centros sem obra nenhuma — o schema documenta o caso ("administrativo, cobrindo
despesas de estrutura/overhead") e os comentários citam **Escritório e Fazenda**
como destinos reais.

Usado em `PurchaseRequest` (obrigatório — é o que o solicitante escolhe, e a
**obra é derivada dele**), `PurchaseOrder`, `Invoice`, `EmployeeAllocation`,
`ProductionEntry`. A obra é materializada na linha por desempenho de relatório,
mas **a fonte da verdade é o centro de custo**.

**Impactos de adotar CENTRO DE CUSTO = OBRA.**

A regra não é "não criar uma estrutura nova" — é decidir **o destino da que já
existe**. E ela hoje faz mais do que a obra faria: cobre despesa administrativa,
que por definição não tem obra. Colapsar os dois deixa a despesa de escritório
sem destino.

**Achado mais importante desta auditoria:** N centros por obra é uso legítimo
(fundação, estrutura, acabamento) — e isso é **exatamente o item 11 (subdivisão)
por outro nome**. Se o centro de custo virar a obra, a subdivisão precisa nascer
de outra estrutura. **Os itens 10 e 11 são a mesma decisão e não podem ser
tomados em separado.**

Três desenhos possíveis:

| | Desenho | Custo | Avaliação |
| --- | --- | --- | --- |
| **A** | Não mexer no banco. Cada obra nasce com um centro de custo homônimo criado automaticamente; o seletor de centro some das telas e passa a mostrar a obra; administrativos continuam existindo por baixo. | Baixo | **Recomendado.** Reversível, sem perda de histórico, preserva a arquitetura. |
| **B** | Mover as FKs de `costCenterId` para `constructionSiteId` e aposentar `CostCenter`. | Alto | Toca 5 tabelas, migration irreversível, quebra os administrativos. **Não recomendo.** |
| **C** | Manter os dois e tornar `constructionSiteId` obrigatório no centro. | Médio | Quebra os administrativos igual, sem ganho. |

Levar **B** ao cliente só se ele confirmar que despesa administrativa está fora
do escopo — e a base de staging pode responder isso antes da conversa (contar
centros com `constructionSiteId` nulo e quanto de despesa está pendurado neles).
Consulta somente leitura.

---

## 11. Subdivisão da Obra — pendente de validação com o cliente

**A arquitetura permitiria?** Sim, por três caminhos, nenhum traumático:

- **(a) auto-relação** em `ConstructionSite` (`parentId`). Herda todo filtro e
  relatório que já existem, mas a etapa passa a aparecer como obra em toda
  listagem, e o acesso por obra (item 8) teria de entender hierarquia.
- **(b) entidade nova** `ConstructionStage` + `stageId` nas transações. Mais
  limpo semanticamente, custo de propagação parecido com o do item 8.
- **(c) o que já está no banco:** o `CostCenter` por obra **já é** uma subdivisão
  de fato. Se o cliente descrever a subdivisão como "fundação / estrutura /
  acabamento", ela existe e não precisa de nada novo — precisa de rótulo e tela.

**Pergunta a fazer ao cliente:** *subdivisão é rateio de custo* (então é o centro
de custo que já existe, caminho **c**) *ou é cronograma físico com prazo e
medição* (então é entidade nova, e encosta nos itens 4.1/4.2 do backlog)?

Amarrado à decisão do item 10.

---

## 12. Unidades

O termo é **ambíguo no sistema** e a auditoria não resolve a ambiguidade sem o
cliente. Há três leituras, com custos que diferem em uma ordem de grandeza:

| Leitura | Existe hoje? | Impacto |
| --- | --- | --- |
| **(a) Unidade de medida** | Campo `unit` (String livre) em `PurchaseRequestItem`, `ProductionEntry`, `InboundInvoiceItem`. **Sem catálogo, sem validação, sem conversão** — "sc", "SC" e "saco" são três unidades. | **Baixo.** Tabela de catálogo + selects; `unit` continua String e passa a ser validada. Sem quebra. |
| **(b) Unidade organizacional / filial** | **Não existe.** A hierarquia é `Company → ConstructionSite`, sem nível intermediário. | **Alto, estrutural.** Terceira dimensão de agrupamento, alcance comparável ao do item 8, e **conflita com a decisão do item 10**. |
| **(c) Unidade imobiliária** (apartamento/lote) | Não existe. | **= item 11** com outro nome. |

O item 4.5 do backlog já observa que, em (a), a unidade "morre na solicitação"
porque a OC não tem itens.

**Ação: pergunta fechada ao cliente antes de qualquer estimativa.**

---

# Resultado

## 1. O que já existe

- Cadeia de documentos `Solicitação → OC → NF → Conta a Pagar → Pagamento`, com
  transições de status validadas e alçada por valor na aprovação.
- Fornecedor: CRUD, unicidade por CNPJ dentro da empresa, resolução por CNPJ na
  conciliação.
- Conciliação com duas modalidades (com e sem OC), sugestões pontuadas,
  divergência com aceite explícito, parcelamento por condição de pagamento.
- Integração fiscal NF-e completa: certificado A1 cifrado, sincronização DF-e,
  importação, itens do XML, notas canceladas.
- Anexos: storage com dois drivers, catálogo de 10 entidades (inclui
  `AccountPayable` e `Invoice`), validação de conteúdo, PDF servido inline.
- RBAC granular `view`/`manage` por módulo, 6 papéis padrão, menu por permissão,
  snapshot no JWT.
- Multi-tenant provado (17/17 no script de isolamento), soft delete com lixeira,
  auditoria por extensão do Prisma Client, exportação Excel/PDF de relatórios.

## 2. O que existe parcialmente

| Item | O que falta |
| --- | --- |
| Rastreabilidade de compra | Existe por documento; **não existe por item** a partir da OC. |
| Cotação | `estimatedUnitPrice` por item; **não há propostas comparáveis** de fornecedores diferentes. |
| Conta a pagar sem OC | Só pela conciliação. O lançamento manual de nota ainda exige `purchaseOrderId`; AP avulsa não existe. |
| Prevenção de duplicidade de fornecedor | Unique existe, mas **sem normalização de CNPJ** — máscara cria duplicata e impede o casamento com a NF-e. |
| Centro de custo | Estrutura completa, **mas não é a obra** — 1:N e com administrativos sem obra. |
| Unidade | Campo `unit` livre, sem catálogo. |
| Recebimento de mercadoria | Status `RECEIVED` no enum, nada o popula. |

## 3. O que não existe

Itens na OC · cálculo automático do valor da OC · PDF da OC · múltiplos
fornecedores por OC · criação automática de fornecedor a partir da NF-e ·
Conta a Pagar avulsa · conciliação por item, rateio e desfazer · qualquer leitura
de boleto · escopo de acesso por obra · **qualquer dado bancário no sistema** ·
subdivisão de obra · unidade organizacional · catálogo de unidades de medida ·
canal estruturado Engenharia → Financeiro para condições de pagamento.

## 4. Tabelas impactadas

| Tabela | Natureza da mudança |
| --- | --- |
| **`PurchaseOrderItem`** | **Nova.** Itens da OC, com origem em `PurchaseRequestItem`. |
| **`UserConstructionSite`** | **Nova.** Obras permitidas por usuário. |
| **`BankAccount`** (ou campos em `Employee`/`Supplier`) | **Nova.** Dados bancários. |
| `AccountPayable` | `invoiceId` → nullable; ganha `supplierId`, `costCenterId`, `constructionSiteId`, `description`, `barcodeLine`, `payeeDocument`. |
| `PurchaseRequest` / `PurchaseRequestItem` | Campos de intenção de pagamento (fornecedor sugerido, vencimento, forma); ativar ou remover `neededBy`. |
| `PurchaseOrder` | `totalAmount` passa a ser derivado dos itens; possível saldo/recebimento. |
| `Supplier` | Normalização de `document` (migration de dados); dados bancários. |
| `InboundInvoiceItem` | Vínculo opcional com item de OC (conciliação por item). |
| `Invoice` | Nenhuma mudança de coluna; muda quem pode criá-la sem OC. |
| `CostCenter` / `ConstructionSite` | Depende da decisão 10/11. No desenho **A**, nenhuma alteração de schema. |
| `Permission` | Registros novos (`rh.bank_data`, escopo por obra). Sem DDL — o catálogo é texto livre. |
| `Employee` | Dados bancários; mascaramento em `AuditLog.changes`. |

## 5. Módulos impactados

`compras` (o mais afetado: itens, PDF, cálculo, cotação) · `financeiro` (AP
avulsa, boleto, lançamento manual) · `conciliacao` (modalidades) · `engenharia`
(centro de custo = obra, subdivisão) · `rh` (dados bancários) · `auth`+`common`
(escopo por obra, permissão nova) · `relatorios` e `search` (arrastados por
qualquer mudança de escopo ou de ancoragem da AP) · `attachments`/`storage`
(boleto — reuso, sem alteração) · `apps/web` correspondente a cada um.

## 6. Dependências entre as funcionalidades

```
[Decisão cliente 10+11+12]  ──────► 10 Centro de custo = Obra
        │                                    │
        │                                    ▼
        └──────────────────────────►  8 Acesso por obra
                                             ▲
5 CNPJ normalizado ──► criação automática de fornecedor
        │
        ▼
2 PurchaseOrderItem ──┬──► cálculo automático do valor da OC
   (pedra angular)    ├──► PDF da OC
                      ├──► rastreabilidade por item
                      ├──► múltiplos fornecedores (via N OCs)
                      ├──► conciliação por item
                      └──► recebimento de mercadoria (4.3)

4 AP avulsa ──┬──► 7 Boletos
              └──► 6 Conciliação modalidade "direta"
                      ▲
                      └── refactor das modalidades (antes de acrescentar)

9 Dados bancários ──► 3 "destino do pagamento" (Engenharia → Financeiro)
```

**Dependências duras:** boleto exige AP avulsa · "destino do pagamento" exige
dados bancários · tudo que é por item exige `PurchaseOrderItem` · acesso por obra
exige a decisão do que é obra.

## 7. Riscos técnicos

1. **Cobertura de teste quase nula — 3 arquivos `.spec.ts` no repositório
   inteiro.** É o risco que multiplica todos os outros: não há rede para mudanças
   de alcance largo. Antes do item 8 (escopo por obra), vale investir em teste de
   escopo — é a única mudança onde a falha é *silenciosa* (dado vazando ou
   sumindo, sem erro).
2. **Escopo por obra: regressão silenciosa.** Um filtro esquecido é vazamento
   entre obras; um filtro a mais é dado desaparecendo da tela. 79 pontos a
   revisar, com travessias de dois níveis.
3. **`CostCenter` = `Obra` no desenho B é irreversível** e deixa a despesa
   administrativa órfã. O desenho A não tem esse risco.
4. **`reconcile()` acumulando modalidades** — refatorar antes de acrescentar, ou
   o método vira o ponto único de falha do financeiro.
5. **Normalização de CNPJ exige migration de dados** com possibilidade de colisão
   (dois registros que viram o mesmo CNPJ). Precisa de contagem prévia e de
   política de fusão.
6. **`AccountPayable.invoiceId` nullable** propaga por consultas, telas,
   relatórios e busca global — TypeScript pega a maior parte, o restante é
   revisão manual.
7. **LGPD nos dados bancários**, incluindo o vazamento por `AuditLog.changes`.
8. **Base de staging com histórico real** (~1.262 notas importadas): qualquer
   migration precisa ser conferida contra ela, não contra base vazia.
9. **Ambiguidade do item 12** — estimar antes de resolver a leitura é estimar
   errado por uma ordem de grandeza.

## 8. Ordem recomendada de implementação

| # | O que | Por que nesta posição |
| --- | --- | --- |
| **0** | **Decisões com o cliente** (10, 11, 12) e contagens somente-leitura em staging. | Bloqueia 3 itens e não consome sprint de desenvolvimento — roda em paralelo. |
| **1** | Normalização de CNPJ + criação automática de fornecedor no ato da conciliação. | Corrige defeito existente, não depende de nada, e aumenta imediatamente a taxa de conciliação da fila já importada. |
| **2** | **`PurchaseOrderItem`** (backlog 4.5). | **Pedra angular.** Destrava seis funcionalidades. Tudo que for feito antes na OC será refeito depois. |
| **3** | Cálculo automático do valor da OC + PDF da OC. | Consequência direta de 2. Fazer o PDF antes o faria nascer sem itens. |
| **4** | Conta a Pagar avulsa (+ corrigir o lançamento manual de nota sem OC). | Destrava boleto e a modalidade direta de conciliação. |
| **5** | Refactor das modalidades de conciliação + modalidade "conta a pagar direta". | O refactor precisa vir antes da terceira modalidade. |
| **6** | Dados bancários (funcionário + fornecedor) com permissão própria. | Pré-requisito do "destino do pagamento". |
| **7** | Engenharia → Financeiro: campos estruturados de intenção de pagamento na solicitação. | Depende de 2 (fornecedor por item) e de 6 (destino). |
| **8** | Boletos — entrega 1 (linha digitável) e depois entrega 2 (extração do PDF). | Depende de 4. |
| **9** | Centro de custo = Obra, conforme a decisão do passo 0 (desenho A). | Precisa acontecer **antes** do acesso por obra: define o que se filtra. |
| **10** | **Acesso por obra.** | Por último de propósito: toca tudo que veio antes. Fazer agora estabiliza a superfície uma vez, em vez de duas. **Exceção:** se for exigência de compliance do cliente, sobe — mas ainda depois do passo 9. |
| **11** | Subdivisão da obra e Unidades, conforme a decisão do passo 0. | Podem não exigir código nenhum (caminhos 11-c e 12-a). |

## 9. Sugestão de divisão em Sprints

**Sprint 1 — Fundação de compras** *(paralelo: decisões com o cliente)*
Normalização de CNPJ + fornecedor automático na conciliação · `PurchaseOrderItem`
com origem no item da solicitação · valor da OC calculado a partir dos itens.
*Entrega visível:* a OC deixa de ser um valor digitado e passa a ser um pedido.

**Sprint 2 — O documento e o dinheiro avulso**
PDF da OC com itens · Conta a Pagar avulsa (`invoiceId` opcional + ancoragem
própria + revisão das consultas) · corrigir o lançamento manual de nota sem OC.
*Entrega visível:* pedido enviável ao fornecedor; Financeiro lança despesa sem
depender de compra.

**Sprint 3 — Conciliação e boleto**
Refactor das modalidades · modalidade "conta a pagar direta" · boleto entrega 1
(linha digitável → conferência → AP).
*Entrega visível:* boleto entra no sistema sem redigitação.

**Sprint 4 — Pagamento com destino**
Dados bancários (funcionário + fornecedor) com permissão própria e mascaramento
em auditoria · Engenharia → Financeiro: fornecedor sugerido, vencimento, forma e
destino na solicitação · boleto entrega 2 (extração do PDF).
*Entrega visível:* a Engenharia informa como pagar, e o Financeiro recebe isso
como dado, não como recado.

**Sprint 5 — Escopo e organização** *(a maior; considerar dividir em duas)*
Centro de custo = Obra (desenho A) · acesso por obra (tabela, escopo no JWT,
interceptor, propagação nos 79 pontos, testes de escopo) · subdivisão e unidades
conforme decisão.
*Entrega visível:* João vê as obras A e B, não a C.

**Fora das sprints, contínuo:** teste de escopo antes da Sprint 5 — é o único
lugar onde a falha não aparece como erro.
