# Ordem de Compra — itens, total e PDF

Como a Ordem de Compra funciona depois das etapas de 23/08/2026. Complementa
`docs/plano-evolucoes.md` (item 4.5, concluído) e a auditoria em
`docs/auditoria-necessidades-operacionais.md`.

## Estrutura

```
PurchaseRequest ──> PurchaseRequestItem
                          │  (purchaseRequestItemId, NOT NULL)
                          ▼
PurchaseOrder ─────> PurchaseOrderItem
```

O vínculo é por **item**, não por documento. `PurchaseOrder.purchaseRequestId`
continua existindo, mas quem sustenta a rastreabilidade é
`PurchaseOrderItem.purchaseRequestItemId`.

`description` e `unit` são **copiadas** da linha de origem pelo backend — não
chegam do cliente. A ordem é um documento enviado ao fornecedor: o que ela diz
precisa continuar valendo mesmo que a solicitação mude depois.

## Como o total é calculado

Dois níveis, os dois no backend, os dois em `Prisma.Decimal`:

| | Fórmula | Onde |
| --- | --- | --- |
| Item | `quantity × unitPrice`, arredondado a 2 casas (HALF_UP) | `calculateItemTotal` |
| Ordem | soma dos `totalPrice` **já arredondados** | `sumItemTotals` |

Ambas em `src/compras/purchase-orders/purchase-orders.service.ts`.

Somar os totais já arredondados (e não os produtos brutos) é deliberado: o
número impresso no rodapé tem de ser a soma exata da coluna impressa acima
dele. Somar os produtos brutos daria um total que ninguém consegue conferir
somando o que vê.

`totalAmount` **não existe nos DTOs** de criação nem de edição. Um valor
enviado pelo cliente é simplesmente ignorado.

**Recálculo**: acontece na criação e sempre que `items` vem no `PATCH`. Editar
uma ordem sem enviar itens **não** recalcula — é o que protege as ordens
emitidas antes desta estrutura, que não têm itens e cujo `totalAmount` foi
digitado à mão. Recalcular ali as zeraria.

## Como o PDF é gerado

Duas camadas, separadas de propósito:

| Arquivo | Responsabilidade |
| --- | --- |
| `pdf/purchase-order-document.ts` | **Puro.** Monta o conteúdo já formatado (pt-BR), decide o que entra e o que é omitido. Sem pdfkit. |
| `pdf/purchase-order-pdf.ts` | **Desenho.** pdfkit: posiciona, pagina, repete cabeçalho de tabela, numera páginas. |

A separação é o que torna o conteúdo testável sem gerar arquivo. Tudo que pode
estar errado de um jeito que importa — valor formatado, data com fuso, campo
ausente virando texto inventado — vive na camada pura.

**Regras que o renderizador precisa acertar:**

- A altura de cada linha é a da **célula mais alta**, medida antes de desenhar
  (`measureRowHeight`). Medir só a descrição deixava a coluna "Origem" quebrar
  por cima da linha seguinte.
- O cabeçalho da tabela se repete em toda página de continuação.
- Total, observações e origem nunca ficam órfãos: se o bloco não cabe inteiro,
  vai para a próxima página (`ensureSpace`).
- `bufferPages: true` para conseguir escrever "Página X de Y".

**Dados da empresa e do fornecedor**: campo ausente é **omitido**, nunca
preenchido com "—" ou texto fictício (`joinAddress`, `field`). Hoje a `Company`
do staging tem apenas `legalName`/`tradeName` preenchidos — o cabeçalho sai só
com o nome até alguém completar Configurações → Empresa.

**Observações**: vêm da **solicitação de origem**. A `PurchaseOrder` não tem
campo próprio de observação no modelo atual.

## Endpoints

| Método | Rota | Permissão | Mudança |
| --- | --- | --- | --- |
| `POST` | `/purchase-orders` | `compras.manage` | `items[]` obrigatório; `totalAmount` **removido** do corpo |
| `PATCH` | `/purchase-orders/:id` | `compras.manage` | `items[]` opcional (substitui a lista); `totalAmount` **removido** |
| `GET` | `/purchase-orders`, `/:id` | `compras.view` | passam a devolver `items[]` com a origem |
| `GET` | `/purchase-orders/:id/pdf` | `compras.view` | **novo** — `application/pdf`, `inline` |

Nenhuma permissão nova foi criada: quem pode ver a ordem pode imprimi-la.

## Isolamento multi-tenant

O PDF é montado a partir de **uma** consulta já filtrada por `companyId`;
itens, solicitação, obra, centro de custo e fornecedor vêm aninhados nela. Não
há id vindo do cliente sendo usado para buscar nada — um id de outra empresa
não encontra ordem alguma e recebe 404.

Na criação/edição, cada `purchaseRequestItemId` é conferido contra a
solicitação **desta** ordem, com o filtro atravessando a relação até o
`companyId`.

## Ordens emitidas antes desta estrutura

As 4 ordens do staging não têm itens e continuam válidas:

- o `totalAmount` digitado é preservado e é o que o PDF imprime;
- a tela as marca como "sem itens" e explica na expansão;
- o PDF gera normalmente, com uma nota no lugar da tabela;
- **não houve backfill**: três das quatro solicitações de origem não têm preço
  cotado, então não havia valor para copiar sem inventá-lo.
