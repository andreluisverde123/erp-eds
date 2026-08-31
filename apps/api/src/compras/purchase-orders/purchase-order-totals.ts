import { Prisma } from '../../../generated/prisma/client';

import { ZERO, money, resolveDiscount, round, type Discount, type DiscountType } from '../discount';

export type { Discount, DiscountType };

/// A conta da ORDEM DE COMPRA — mesma aritmética da cotação, item diferente.
///
/// Por que não reaproveitar `calculateQuoteTotals` direto: a linha da cotação
/// tem `estimatedUnitPrice` (que pode ser nulo) e `unavailable`, e a regra de
/// "qual item entra na conta" existe só lá. Na ordem, toda linha entra —
/// ela existe porque o comprador a escolheu, e o preço é obrigatório.
/// Forçar a linha da ordem no formato da cotação obrigaria a inventar um
/// `unavailable: false` em todo lugar e deixaria o preço opcional num tipo
/// onde ele nunca é.
///
/// O que NÃO se duplica é a aritmética: arredondamento, percentual e clamp vêm
/// de `../discount.ts`, um módulo só. É o que garante que a ordem gerada a
/// partir de uma solicitação feche no mesmo centavo que ela.

export interface OrderItem {
  quantity: Prisma.Decimal | number | string;
  unitPrice: Prisma.Decimal | number | string;
  discountType: DiscountType;
  discountValue: Prisma.Decimal | number | string;
}

export interface OrderItemTotals {
  /// `quantidade × preço unitário`, antes do desconto da linha.
  gross: Prisma.Decimal;
  /// O desconto DA LINHA já resolvido em reais.
  discount: Prisma.Decimal;
  /// `gross − discount`. É o que vai para `PurchaseOrderItem.totalPrice`.
  net: Prisma.Decimal;
}

export interface OrderTotals {
  itemsSubtotal: Prisma.Decimal;
  itemsDiscount: Prisma.Decimal;
  /// Base do desconto geral.
  subtotalAfterItemDiscounts: Prisma.Decimal;
  generalDiscount: Prisma.Decimal;
  /// O que vai para `PurchaseOrder.totalAmount`.
  total: Prisma.Decimal;
}

export function calculateOrderItemTotals(item: OrderItem): OrderItemTotals {
  const gross = round(money(item.quantity).times(money(item.unitPrice)));
  const discount = resolveDiscount(gross, {
    type: item.discountType,
    value: item.discountValue,
  });

  return { gross, discount, net: gross.minus(discount) };
}

/// Soma os valores JÁ ARREDONDADOS de cada linha, e não o produto bruto de
/// cada uma: é o que faz o total bater com a coluna que o comprador lê, em vez
/// de divergir por centavos de algo que ninguém consegue conferir na tela.
export function calculateOrderTotals(items: OrderItem[], generalDiscount: Discount): OrderTotals {
  const linhas = items.map(calculateOrderItemTotals);

  const itemsSubtotal = linhas.reduce((soma, linha) => soma.plus(linha.gross), ZERO);
  const itemsDiscount = linhas.reduce((soma, linha) => soma.plus(linha.discount), ZERO);
  const subtotalAfterItemDiscounts = itemsSubtotal.minus(itemsDiscount);

  const resolvedGeneral = resolveDiscount(subtotalAfterItemDiscounts, generalDiscount);

  return {
    itemsSubtotal,
    itemsDiscount,
    subtotalAfterItemDiscounts,
    generalDiscount: resolvedGeneral,
    total: subtotalAfterItemDiscounts.minus(resolvedGeneral),
  };
}
