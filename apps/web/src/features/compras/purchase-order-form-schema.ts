import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/// Uma linha da solicitação dentro do formulário da ordem.
///
/// `description`, `unit` e `requestedQuantity` estão aqui só para EXIBIR — não
/// são enviados. Quem grava descrição e unidade é o backend, copiando da linha
/// de origem; a quantidade solicitada aparece ao lado da comprada para o
/// comprador ver a diferença enquanto digita.
const purchaseOrderItemSchema = z.object({
  purchaseRequestItemId: z.string(),
  description: z.string(),
  unit: z.string(),
  requestedQuantity: z.string(),
  selected: z.boolean(),
  quantity: z.string(),
  unitPrice: z.string(),
});

export const purchaseOrderFormSchema = z
  .object({
    supplierId: z.string().min(1, 'Selecione o fornecedor.'),
    /// Obrigatório aqui, mesmo sendo opcional na solicitação: é nesta tela que
    /// o dinheiro é comprometido, e a ordem não pode nascer sem atribuição de
    /// custo. Vem pré-preenchido quando a solicitação já trouxe um.
    costCenterId: z.string().min(1, 'Selecione o centro de custo.'),
    issueDate: z.string().min(1, 'Informe a data de emissão.'),
    expectedDeliveryDate: z.string().optional(),
    items: z.array(purchaseOrderItemSchema),
  })
  .superRefine((values, ctx) => {
    const selecionados = values.items.filter((item) => item.selected);

    if (selecionados.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Selecione ao menos um item da solicitação.',
      });
      return;
    }

    // Só valida o que foi SELECIONADO: uma linha desmarcada pode ficar em
    // branco, e reclamar dela travaria a compra parcial.
    values.items.forEach((item, index) => {
      if (!item.selected) return;

      if (!isValidNumber(item.quantity) || Number(item.quantity) <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quantity'],
          message: 'Quantidade deve ser maior que zero.',
        });
      }
      // Zero é válido (brinde/bonificação); negativo não.
      if (!isValidNumber(item.unitPrice) || Number(item.unitPrice) < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'unitPrice'],
          message: 'Informe o valor unitário.',
        });
      }
    });
  });

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>;
export type PurchaseOrderItemFormValues = z.infer<typeof purchaseOrderItemSchema>;

export const PURCHASE_ORDER_FORM_DEFAULTS: PurchaseOrderFormValues = {
  supplierId: '',
  costCenterId: '',
  issueDate: new Date().toISOString().slice(0, 10),
  expectedDeliveryDate: '',
  items: [],
};

/// Converte os itens da solicitação nas linhas iniciais do formulário.
///
/// É isto que evita a redigitação: tudo já vem preenchido com o que a
/// solicitação e a cotação sabem, e o comprador só ajusta o que negociou.
export function itemsFromPurchaseRequest(
  items: {
    id: string;
    description: string;
    unit: string;
    quantity: string;
    estimatedUnitPrice: string | null;
  }[],
): PurchaseOrderItemFormValues[] {
  return items.map((item) => ({
    purchaseRequestItemId: item.id,
    description: item.description,
    unit: item.unit,
    requestedQuantity: item.quantity,
    // Todas marcadas por padrão: comprar a solicitação inteira é o caso
    // comum; desmarcar é o que faz a compra parcial.
    selected: true,
    quantity: String(Number(item.quantity)),
    // Sem cotação o campo nasce vazio, para o comprador informar o negociado
    // em vez de partir de um zero que parece preço.
    unitPrice: item.estimatedUnitPrice ? String(Number(item.estimatedUnitPrice)) : '',
  }));
}

/// Soma das linhas selecionadas. INFORMATIVA: nesta etapa o total da ordem
/// continua sendo digitado (ver `PurchaseOrder.totalAmount`); mostrar a soma
/// só evita que o comprador digite um número que não fecha com os itens.
export function selectedItemsSubtotal(items: PurchaseOrderItemFormValues[]): number {
  return items
    .filter((item) => item.selected)
    .reduce((total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
}
