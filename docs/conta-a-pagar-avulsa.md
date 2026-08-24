# Conta a Pagar avulsa

O Financeiro passa a lançar uma conta a pagar sem solicitação, ordem de compra
ou nota fiscal. O fluxo antigo (NF-e → Conciliação → Conta a Pagar) continua
exatamente como estava e coexiste com o novo.

## Os dois caminhos

```
NF-e ─> Conciliação ─┐
                     ├─> Invoice ─> AccountPayable (origin = INVOICE)
Nota lançada à mão ──┘

Financeiro ─────────────────────> AccountPayable (origin = MANUAL)
                                  invoiceId = null
```

Depois de criada, a conta é a **mesma** nos dois casos: nasce `OPEN` e segue
pelo fluxo de pagamento, baixa, comprovante e recálculo de status que já
existia. Esta etapa não criou nenhum caminho novo depois da criação.

## Por que `origin` tem dois valores e não três

O negócio fala em "NF", "OC" e "manual". O modelo tem exatamente **dois**
caminhos de criação, então o enum tem dois valores.

Um terceiro seria ambíguo: uma conta vinda de nota conciliada **que tem ordem
de compra** seria "NF" e "OC" ao mesmo tempo, e o campo teria de escolher uma
mentira. O detalhe continua respondível sem inventar valor:

| Pergunta | Como responder |
| --- | --- |
| Nasceu de lançamento manual? | `origin = MANUAL` |
| Nasceu de nota? | `origin = INVOICE` |
| Essa nota veio de ordem de compra? | `invoice.purchaseOrderId != null` |
| Essa nota veio da conciliação de NF-e? | `invoice.inboundInvoices` não vazio |

## Ancoragem: por que o fornecedor saiu da nota

`AccountPayable` ganhou `supplierId` (NOT NULL), `costCenterId` e
`constructionSiteId` próprios. Antes, tudo isso só existia por travessia até a
`Invoice`.

Motivo: com contas sem nota, **todo filtro que passasse pela relação passaria a
esconder as avulsas** — em Prisma, um filtro de relação exige que a relação
exista. O relatório financeiro tinha `where: { invoice: { supplierId } }`, que
depois desta mudança excluiria silenciosamente toda despesa avulsa, mesmo sem
filtro aplicado. Materializar na conta dá um caminho só.

Não há risco de divergência: `Invoice.supplierId` é imutável — não aparece em
nenhum DTO de edição (o `CreateInvoiceDto` nem o expõe; ele vem da ordem).

## Regras do lançamento avulso

| Campo | Regra |
| --- | --- |
| Fornecedor | **Obrigatório**, escolhido do cadastro. Nunca texto livre. |
| Descrição | **Obrigatória** — é a única identificação de uma conta sem documento fiscal. |
| Centro de custo | **Obrigatório**. Mesma regra que a conciliação sem ordem já aplica: a despesa precisa pertencer a algum lugar. |
| Obra | **Derivada** do centro de custo, nunca escolhida à parte. Fica nula quando o centro é administrativo. |
| Forma de pagamento | Opcional, do enum `PaymentMethod` existente (PIX, boleto, cartão, dinheiro). Nenhuma modalidade nova foi criada. |
| Valor / vencimento | Obrigatórios; valor > 0. |
| Emissão, nº do documento, observações | Opcionais. |

**Despesa administrativa**: entra por um centro de custo sem obra — o modelo já
suporta (`CostCenter.constructionSiteId` é opcional, e o schema cita Escritório
e Fazenda). Hoje o staging **não tem nenhum** centro administrativo cadastrado;
enquanto não existir um, toda despesa avulsa precisa ser atribuída a uma obra.

**Categoria/tipo de despesa** não existe no ERP e não foi criada.

## Permissões

Nenhuma permissão nova. `financeiro.view` para ver, `financeiro.manage` para
lançar — as mesmas que já governavam o módulo.

## Auditoria

Pelo mecanismo que já existe: a extensão do Prisma
(`common/prisma/audit-extension.ts`) grava um `AuditLog` de `CREATE` com o
usuário da requisição. Por isso o service usa `create` e não `createMany` — a
extensão não cobre `createMany`. A origem manual fica registrada de forma
permanente na própria linha, em `origin`.

## Onde está

| O quê | Onde |
| --- | --- |
| Criação nos dois modos | `account-payables.service.ts` → `create`, `resolveFromInvoice`, `resolveManual` |
| Contrato | `dto/create-account-payable.dto.ts` (`invoiceId` opcional; `ValidateIf` exige o resto quando ele falta) |
| Tela | `pages/financeiro/contas-a-pagar-page.tsx` + `components/account-payable-form-drawer.tsx` |

Endpoint: `POST /account-payables` — o **mesmo** que já existia. Com
`invoiceId` no corpo, comportamento idêntico ao anterior; sem ele, lançamento
manual. Nenhuma rota foi criada ou removida.

## Compatibilidade com os dados existentes

A migration `20260823184500_conta_a_pagar_avulsa` é aditiva e faz backfill:

- `invoiceId` deixa de ser `NOT NULL`; nenhum vínculo existente é apagado;
- toda conta já existente recebe `origin = INVOICE`;
- `supplierId`, `costCenterId` e `constructionSiteId` são copiados da nota
  (inclusive nas contas soft-deletadas, para a Lixeira continuar restaurando);
- onde a nota não tinha centro de custo, a conta fica sem — é a informação
  correta, não havia atribuição;
- só depois do backfill `origin` e `supplierId` recebem `NOT NULL`, e um bloco
  de guarda aborta a migration se sobrar conta sem fornecedor.

## Pendente de decisão

1. **Editar uma conta avulsa.** `PATCH` continua aceitando só `dueDate` e
   `amount` (regra antiga, preservada). Corrigir a descrição ou o centro de
   custo de um lançamento manual exige excluir e relançar.
2. **Centro de custo administrativo.** Precisa existir ao menos um para a
   despesa de escritório ter onde cair.
3. **"Transferência" como forma de pagamento** não existe no enum atual.
