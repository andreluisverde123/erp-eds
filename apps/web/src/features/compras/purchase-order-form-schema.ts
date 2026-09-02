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
  /// O SALDO desta linha: `solicitada − já comprada em outras ordens`. É o
  /// TETO desta compra, e o backend confere de novo dentro de uma transação
  /// que trava a solicitação — aqui é só para a pessoa ver o limite enquanto
  /// digita, em vez de descobri-lo num erro depois de salvar.
  pendingQuantity: z.string(),
  /// Quanto já foi comprado em ordens anteriores. Só EXIBE, para explicar de
  /// onde saiu um pendente menor que o solicitado.
  fulfilledQuantity: z.string(),
  /// A cotação disse que o fornecedor dela não tinha este item. Também só
  /// EXIBE: não bloqueia nada, porque a ordem pode ser para OUTRO fornecedor
  /// — que é justamente como o item volta a ser comprado.
  unavailableInQuote: z.boolean(),
  selected: z.boolean(),
  quantity: z.string(),
  unitPrice: z.string(),
  /// Desconto DESTA linha, copiado da cotação e editável. Guardado como texto,
  /// como os demais campos numéricos do formulário: o `<input>` devolve string,
  /// e converter a cada tecla faria "1," virar 1 e apagar a vírgula que a
  /// pessoa acabou de digitar.
  discountType: z.enum(['AMOUNT', 'PERCENT']),
  discountValue: z.string(),
});

export const purchaseOrderFormSchema = z
  .object({
    supplierId: z.string().min(1, 'Selecione o fornecedor.'),
    /// Obrigatório aqui, mesmo sendo opcional na solicitação: é nesta tela que
    /// o dinheiro é comprometido, e a ordem não pode nascer sem atribuição de
    /// custo. Vem pré-preenchido quando a solicitação já trouxe um.
    /// OPCIONAL, como na solicitação. Exigi-lo aqui obrigava o comprador a
    /// escolher uma conta qualquer para conseguir emitir a ordem de uma
    /// solicitação que veio sem centro de custo — e conta escolhida no
    /// aperto entra no relatório de custos como se fosse decisão.
    costCenterId: z.string().optional(),
    issueDate: z.string().min(1, 'Informe a data de emissão.'),
    expectedDeliveryDate: z.string().optional(),
    items: z.array(purchaseOrderItemSchema),
    /// Desconto GERAL, sobre o subtotal já líquido dos descontos de item.
    /// Copiado da solicitação: foi ele que o setor negociou, e a ordem que
    /// nascesse sem ele sairia acima do acordado.
    discountType: z.enum(['AMOUNT', 'PERCENT']),
    discountValue: z.string(),
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
      } else if (Number(item.quantity) > Number(item.pendingQuantity)) {
        // A soma de TODAS as ordens de uma solicitação nunca pode passar do
        // que foi pedido. O servidor é quem garante isso (e é o único que
        // pode, porque só ele enxerga as ordens que nasceram no meio-tempo);
        // esta checagem existe para a pessoa não digitar 41 num saldo de 40 e
        // só descobrir ao salvar.
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quantity'],
          message: `Restam apenas ${Number(item.pendingQuantity).toLocaleString('pt-BR')} em aberto.`,
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
  discountType: 'AMOUNT',
  discountValue: '',
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
    unavailable: boolean;
    discountType: 'AMOUNT' | 'PERCENT';
    discountValue: string;
    fulfillment: { fulfilledQuantity: string; pendingQuantity: string };
  }[],
): PurchaseOrderItemFormValues[] {
  return (
    items
      // SÓ O QUE AINDA FALTA COMPRAR. Uma linha já atendida não tem o que
      // fazer aqui: oferecê-la convidaria a comprar de novo o que já foi
      // comprado, e o servidor recusaria — depois de a pessoa ter preenchido.
      //
      // Na PRIMEIRA ordem isto não muda nada: nada foi comprado, então todas
      // as linhas estão pendentes e a lista é a de sempre.
      .filter((item) => Number(item.fulfillment.pendingQuantity) > 0)
      .map((item) => ({
        purchaseRequestItemId: item.id,
        description: item.description,
        unit: item.unit,
        requestedQuantity: item.quantity,
        pendingQuantity: item.fulfillment.pendingQuantity,
        fulfilledQuantity: item.fulfillment.fulfilledQuantity,
        unavailableInQuote: item.unavailable,
        // Todas marcadas por padrão: comprar a solicitação inteira é o caso
        // comum; desmarcar é o que faz a compra parcial.
        //
        // Exceto o que a cotação não achou — esse nasce DESMARCADO, porque não
        // tem preço e não foi negociado. Nasce desmarcado, não bloqueado: se
        // esta ordem for para outro fornecedor, o comprador remarca e digita o
        // valor. É assim que a torneira que o fornecedor A não tinha vira compra
        // do fornecedor B.
        selected: !item.unavailable,
        // Nasce com o SALDO, não com a quantidade original: na segunda ordem, o
        // que se compra é o que falta. Na primeira os dois números são iguais.
        quantity: String(Number(item.fulfillment.pendingQuantity)),
        // Sem cotação o campo nasce vazio, para o comprador informar o negociado
        // em vez de partir de um zero que parece preço.
        unitPrice: item.estimatedUnitPrice ? String(Number(item.estimatedUnitPrice)) : '',
        // O desconto negociado na cotação vem junto. É editável: a ordem é
        // documento próprio e o comprador pode ter renegociado — copiar sem deixar
        // editar transformaria a cotação em contrato.
        discountType: item.discountType,
        discountValue: Number(item.discountValue) > 0 ? String(Number(item.discountValue)) : '',
      }))
  );
}

/// Um desconto informado no formulário, resolvido em reais sobre uma base.
///
/// ESPELHA `resolveDiscount` do backend, inclusive o clamp em `[0, base]`. A
/// tela precisa da conta para MOSTRAR o total enquanto a pessoa digita; quem
/// grava é o servidor, e é lá que ela vale. Duas contas, um resultado — se
/// divergirem, o número que a pessoa viu não é o que foi salvo.
function resolveDiscount(base: number, type: 'AMOUNT' | 'PERCENT', value: string): number {
  const valor = Number(value || 0);
  if (valor <= 0) return 0;

  const resolvido = type === 'PERCENT' ? (base * valor) / 100 : valor;
  return Math.min(Math.max(resolvido, 0), base);
}

export interface PurchaseOrderTotals {
  /// Soma de `quantidade × preço` das linhas selecionadas, antes de descontos.
  itemsSubtotal: number;
  itemsDiscount: number;
  /// Base do desconto geral.
  subtotalAfterItemDiscounts: number;
  generalDiscount: number;
  total: number;
}

/// A conta da ordem como a tela a mostra.
///
/// A ORDEM DAS OPERAÇÕES é a mesma do backend: desconto de linha primeiro, e o
/// geral por cima do subtotal JÁ LÍQUIDO. Aplicá-lo sobre o bruto contaria o
/// abatimento do item duas vezes.
export function calculateFormTotals(values: {
  items: PurchaseOrderItemFormValues[];
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: string;
}): PurchaseOrderTotals {
  const selecionadas = values.items.filter((item) => item.selected);

  const linhas = selecionadas.map((item) => {
    const bruto = round2(Number(item.quantity || 0) * Number(item.unitPrice || 0));
    const desconto = round2(resolveDiscount(bruto, item.discountType, item.discountValue));
    return { bruto, desconto };
  });

  const itemsSubtotal = linhas.reduce((soma, linha) => soma + linha.bruto, 0);
  const itemsDiscount = linhas.reduce((soma, linha) => soma + linha.desconto, 0);
  const subtotalAfterItemDiscounts = itemsSubtotal - itemsDiscount;
  const generalDiscount = round2(
    resolveDiscount(subtotalAfterItemDiscounts, values.discountType, values.discountValue),
  );

  return {
    itemsSubtotal,
    itemsDiscount,
    subtotalAfterItemDiscounts,
    generalDiscount,
    total: subtotalAfterItemDiscounts - generalDiscount,
  };
}

/// Arredonda por linha, como o backend: somar os produtos brutos e arredondar
/// no fim daria um centavo diferente do que a coluna mostra.
function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
