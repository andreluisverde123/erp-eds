import { Prisma } from '../../../generated/prisma/client';

import { ZERO, money, resolveDiscount, round, type Discount, type DiscountType } from '../discount';

/// Reexportados para não quebrar quem já importava daqui — e porque, do ponto
/// de vista da cotação, este continua sendo o módulo da conta dela.
export { resolveDiscount, type Discount, type DiscountType };

/// A conta da COTAÇÃO, montada sobre a aritmética compartilhada de
/// `../discount.ts`.
///
/// As primitivas (arredondamento, resolução de percentual, clamp) saíram daqui
/// quando a ORDEM DE COMPRA passou a ter desconto também: duas cópias da mesma
/// conta divergiriam no primeiro arredondamento, e divergência de centavo entre
/// a cotação e a ordem é o que faz o fornecedor contestar a nota.
///
/// O que ficou é o que é específico da cotação: a regra de qual item ENTRA na
/// conta. A ordem de compra não tem essa regra — lá toda linha existe porque o
/// comprador a escolheu.

/// O que a conta precisa saber de uma linha. Aceita o que vem do Prisma sem
/// conversão, e também literais nos testes.
export interface QuoteItem {
  quantity: Prisma.Decimal | number | string;
  estimatedUnitPrice: Prisma.Decimal | number | string | null;
  unavailable: boolean;
  discountType: DiscountType;
  discountValue: Prisma.Decimal | number | string;
}

export interface QuoteItemTotals {
  /// `quantidade × preço unitário`, antes de qualquer desconto.
  gross: Prisma.Decimal;
  /// O desconto DA LINHA já resolvido em reais.
  discount: Prisma.Decimal;
  /// `gross − discount`. É o que a coluna "Total" da linha mostra.
  net: Prisma.Decimal;
}

export interface QuoteTotals {
  /// Soma dos brutos das linhas cotadas e disponíveis.
  itemsSubtotal: Prisma.Decimal;
  /// Soma dos descontos de linha.
  itemsDiscount: Prisma.Decimal;
  /// `itemsSubtotal − itemsDiscount`. É a base do desconto geral.
  subtotalAfterItemDiscounts: Prisma.Decimal;
  /// O desconto geral já resolvido em reais.
  generalDiscount: Prisma.Decimal;
  /// O número que vale: o que a alçada de aprovação usa e o que a tela mostra.
  total: Prisma.Decimal;
}

/// Um item entra na conta quando o fornecedor TEM o produto e alguém já
/// informou o preço. As duas ausências têm significados diferentes e nenhuma
/// delas é zero — ver a regra C-16.
export function isQuoted(item: QuoteItem): boolean {
  return !item.unavailable && item.estimatedUnitPrice !== null;
}

/// A conta de UMA linha. Item fora da cotação (indisponível ou sem preço) vale
/// zero em tudo — não é "R$ 0,00 de mercadoria", é linha que não entra.
export function calculateItemTotals(item: QuoteItem): QuoteItemTotals {
  if (!isQuoted(item)) {
    return { gross: ZERO, discount: ZERO, net: ZERO };
  }

  const gross = round(money(item.quantity).times(money(item.estimatedUnitPrice)));
  const discount = resolveDiscount(gross, {
    type: item.discountType,
    value: item.discountValue,
  });

  return { gross, discount, net: gross.minus(discount) };
}

/// O resumo financeiro inteiro da cotação.
///
/// Soma os valores JÁ ARREDONDADOS de cada linha, e não o produto bruto de
/// cada uma. É a diferença entre o total bater com a coluna que o usuário lê e
/// ele divergir por centavos de algo que ninguém consegue conferir na tela.
export function calculateQuoteTotals(items: QuoteItem[], generalDiscount: Discount): QuoteTotals {
  const linhas = items.map(calculateItemTotals);

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
