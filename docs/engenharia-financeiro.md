# Engenharia → Financeiro

Como a despesa que nasce na obra chega ao Financeiro sem perder a origem, e
como quem comprou descobre se o fornecedor foi pago. Etapa de 24/08/2026.

Complementa `docs/ordem-de-compra.md`, `docs/conciliacao-nf-oc.md` e
`docs/conta-a-pagar-avulsa.md`.

## O que esta etapa NÃO fez

**Nenhuma migration. Nenhuma coluna nova. Nenhum status novo.**

A auditoria da cadeia mostrou que os relacionamentos já existiam inteiros:

```
PurchaseRequest ──> PurchaseOrder ──> Invoice ──> AccountPayable
      │                   │              ▲
      └── constructionSite│              └── InboundInvoice (NF-e da SEFAZ)
                          └── constructionSite
```

O que faltava era **expor** a travessia. Toda a etapa é leitura derivada.

## A cadeia, e por que ela não é duplicada

Cada elo já era gravado no ato certo, por quem tinha a informação:

| Elo                       | Quem grava                | Quando                      |
| ------------------------- | ------------------------- | --------------------------- |
| solicitação → obra        | `PurchaseRequestsService` | derivada do centro de custo |
| ordem → solicitação       | `PurchaseOrdersService`   | ao gerar a ordem            |
| ordem → obra              | `PurchaseOrdersService`   | copiada da solicitação      |
| nota → ordem              | `InboundInvoicesService`  | na conciliação              |
| conta → nota              | conciliação / validação   | ao gerar as parcelas        |
| conta → obra e fornecedor | conciliação / lançamento  | materializados na parcela   |

A obra aparece materializada em quatro tabelas, e isso **não** é duplicação por
conveniência de tela: cada cópia foi feita para uma consulta que precisa dela
sem travessia (relatórios agrupam por obra; um filtro por relação esconderia
toda conta avulsa, que não tem nota). O que esta etapa se proibiu foi
acrescentar uma quinta cópia — nome de obra, código de OC ou número de NF
gravados na conta a pagar. Nada disso foi criado: a origem é montada na leitura.

## Conta a Pagar: de onde a despesa veio

`AccountPayablesService` passou a incluir a cadeia no `includeArgs`
compartilhado por listagem e detalhe, e a achatá-la em `traceability`
(`traceability.util.ts`, camada pura).

```
Conta a Pagar
 └─ traceability
     ├─ constructionSite   Residencial Alfa
     ├─ purchaseRequest    REQ-000789
     ├─ purchaseOrder      OC-000123
     ├─ supplier           Perini
     ├─ invoice            000456/1        (nota do financeiro)
     ├─ inboundInvoice     000456/1 + chave de acesso (NF-e da SEFAZ)
     └─ depth              PURCHASE_REQUEST
```

**Por que na listagem e não só no detalhe**: o Prisma carrega cada nível de
relação uma vez por PÁGINA, não uma vez por linha. A origem inteira custa três
consultas por página — barato o suficiente para o financeiro não ter que abrir
conta por conta.

**`depth`** existe para a tela dizer "Origem: Solicitação da Engenharia" ou
"Origem: lançamento manual" sem deduzir isso de campos nulos. Quatro valores:
`MANUAL` (conta avulsa), `INVOICE` (compra de balcão, nota sem ordem),
`PURCHASE_ORDER` (ordem sem solicitação — dado antigo) e `PURCHASE_REQUEST`
(cadeia completa).

**A obra vem da própria conta**, não da travessia até a solicitação. As duas
dizem o mesmo quando a cadeia existe, e só a primeira responde para a conta
avulsa.

## Ordem de Compra: onde a compra está no financeiro

`PurchaseOrdersService` passou a anexar `financialStatus`, derivado
(`financial-status.util.ts`, camada pura) do que os módulos do financeiro já
gravam:

| Estágio            | Como é reconhecido                                |
| ------------------ | ------------------------------------------------- |
| `WITHOUT_INVOICE`  | nenhuma NF-e ligada à ordem                       |
| `INVOICE_RECEIVED` | NF-e capturada, ainda não conciliada              |
| `RECONCILED`       | `InboundInvoice.reconciledAt` ou existe `Invoice` |
| `PAYABLE_CREATED`  | existe `AccountPayable`                           |
| `PAID`             | nenhuma parcela em aberto (cancelada não conta)   |

Nenhum status novo foi criado: os cinco são leituras dos enums que já existem.
Uma parcela de três **não** torna a compra paga.

**Duas consultas por página, não duas por linha**: `withFinancialStatus` busca
notas e parcelas de todas as ordens da página com um `in`, e distribui em
memória. Por isso as notas não entraram no `includeArgs` — ele também alimenta
a geração de PDF e o `update`, que não precisam disso.

## Não duplicar o lançamento

`AccountPayablesService.create` passou a recusar (`409`) um lançamento com
`invoiceId` de nota que já tem parcelas. Uma nota vira contas a pagar **uma**
vez, pelo caminho que a criou — a conciliação (que gera o parcelamento) ou a
validação da nota. Chegar ali com a nota já lançada significa o mesmo dinheiro
saindo duas vezes.

Recusar em vez de somar: o parcelamento existente é o lançamento certo. Quem
precisa de outra parcela edita o que existe; quem lançou errado cancela e refaz.

A conciliação já era protegida (`RECONCILABLE_STATUSES`), e `Invoice.VALIDATED`
é terminal — os outros dois caminhos nunca duplicaram.

## Nas telas

Nenhuma tela nova, nenhum dashboard.

| Tela                      | O que ganhou                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Contas a Pagar**        | linha expansível com a origem: obra, solicitação, OC e NF-e, com link                          |
| **Ordens de Compra**      | bloco "Financeiro" na linha expandida: NF recebida ✓ / Conciliada ✓ / Conta a pagar ✓ / Pago ✕ |
| **Solicitação (detalhe)** | badge do estágio financeiro em cada ordem gerada                                               |
| **NF-e / Conciliação**    | nada — a OC vinculada já era exibida inteira desde a etapa anterior                            |

**Links**: obra (`/engenharia/obras/:id`), solicitação
(`/engenharia/solicitacoes/:id`) e NF-e (`/financeiro/conciliacao/:id`) têm tela
própria. A Ordem de Compra não tem — a listagem é a tela dela —, então o link
leva à listagem já filtrada (`?busca=OC-000123`). Foi o único acréscimo de
comportamento no front: a página passou a ler e escrever esse parâmetro na URL.

A Solicitação **já** listava as ordens geradas, por um filtro que já existia
(`GET /purchase-orders?purchaseRequestId=`). Um `include` novo teria criado um
segundo caminho para o mesmo dado — foi revertido assim que o primeiro apareceu.

## Permissões

Nenhuma permissão nova.

- A situação financeira da ordem sai pelo endpoint de Compras, atrás de
  `compras.view`. É o que §9 pede: a Engenharia vê onde a compra dela está.
- Ela é **derivada e somente leitura**. Alterar conta a pagar, mudar vencimento,
  aprovar e dar baixa continuam só no módulo Financeiro, atrás de
  `financeiro.manage` — nenhuma rota de Compras escreve no financeiro.
- O painel de origem sai pelo endpoint do Financeiro (`financeiro.view`) e os
  links levam a telas de Compras/Engenharia, que exigem as permissões delas. O
  papel Financeiro já tem `compras.view`; quem não tiver cai no guard da rota.

**Decisão pendente**: o `financialStatus` expõe a Compras a contagem de parcelas
e se a compra foi paga — status, não valor. Nenhum montante do financeiro
atravessa (só o `totalAmount`, que é da própria ordem). Se o cliente quiser que
nem isso apareça para a Engenharia, o corte é uma permissão a mais.

## Auditoria

Sem mecanismo novo e sem registro novo: esta etapa **não escreve nada**. As
únicas escritas continuam sendo as que já existiam (conciliação, lançamento,
pagamento), com a auditoria que já tinham.

## Testes

| #   | Caso                             | Onde                                                               |
| --- | -------------------------------- | ------------------------------------------------------------------ |
| 1   | Solicitação vinculada à obra     | verificação de integração (abaixo)                                 |
| 2   | Solicitação → OC                 | `purchase-orders.service.spec.ts`                                  |
| 3   | OC → NF-e                        | `reconciliation-flow.spec.ts` + `financial-status.util.spec.ts`    |
| 4   | NF-e → Conta a Pagar             | `reconciliation-flow.spec.ts`                                      |
| 5   | Conta a Pagar exibindo origem    | `traceability.util.spec.ts`, `account-payables.service.spec.ts`    |
| 6   | OC exibindo situação financeira  | `financial-status.util.spec.ts`, `purchase-orders.service.spec.ts` |
| 7   | NF-e exibindo OC relacionada     | `reconciliation-flow.spec.ts` (etapa anterior)                     |
| 8   | Rastreabilidade completa         | `traceability.util.spec.ts` + integração                           |
| 9   | Usuário sem permissão financeira | `purchase-orders.service.spec.ts` (metadado do RBAC)               |
| 10  | Isolamento entre empresas        | os dois service specs + integração                                 |
| 11  | Não duplicação de Conta a Pagar  | `account-payables.service.spec.ts` + integração                    |
| 12  | Relacionamentos opcionais        | `traceability.util.spec.ts`                                        |
| 13  | Fluxo completo                   | verificação de integração                                          |

**Verificação de integração**: a cadeia inteira foi montada em um Postgres 16
descartável (container criado e destruído), com **duas empresas**, e os services
compilados foram executados contra ele. Confirmou a travessia completa, a conta
avulsa sem elos operacionais, os cinco estágios da ordem, a recusa da duplicação
e que a empresa B não alcança — nem por vazamento na cadeia — nenhum dado da
empresa A. O projeto não tem infraestrutura de teste com banco; por isso a
verificação foi feita à mão e não versionada.

## Arquivos

**API**

- `financeiro/account-payables/traceability.util.ts` + spec (novos)
- `financeiro/account-payables/account-payables.service.ts` — include da cadeia,
  `traceability` na listagem e no detalhe, guarda de duplicação
- `compras/purchase-orders/financial-status.util.ts` + spec (novos)
- `compras/purchase-orders/purchase-orders.service.ts` — `withFinancialStatus`
- specs de `account-payables` e `purchase-orders` estendidos

**Web**

- `features/financeiro/components/account-payable-origin.tsx` (novo)
- `features/compras/components/purchase-order-financial-status.tsx` (novo)
- `features/financeiro/components/account-payables-table.tsx` — linha expansível
- `features/compras/components/purchase-orders-table.tsx` — bloco financeiro
- `pages/compras/solicitacao-detail-page.tsx` — badge financeiro
- `pages/compras/ordens-de-compra-page.tsx` — busca pela URL
- `features/financeiro/types.ts`, `features/compras/types.ts`
