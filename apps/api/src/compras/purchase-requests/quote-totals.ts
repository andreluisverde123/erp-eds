import { Prisma } from '../../../generated/prisma/client';

/// A conta da cotação, de ponta a ponta — e o único lugar em que ela existe.
///
/// Tudo em `Prisma.Decimal`, nunca em `number`: quantidade tem 3 casas e preço
/// tem 2, então o produto pode ter 5, e `0.1 * 3` em ponto flutuante devolve
/// `0.30000000000000004`. Num campo de dinheiro isso vira centavo errado.
/// Mesma estratégia de `calculateItemTotal` em `purchase-orders.service.ts`,
/// inclusive o HALF_UP — arredondamento comercial brasileiro (0,005 sobe) e o
/// mesmo que o Postgres aplica ao gravar em `DECIMAL(14,2)`.
///
/// A ORDEM DAS OPERAÇÕES é a regra que este arquivo existe para não deixar
/// ninguém errar:
///
///   1. quantidade × preço unitário          → bruto da linha
///   2. − desconto do item                   → líquido da linha
///   3. Σ linhas                             → subtotal da cotação
///   4. − desconto geral, sobre o SUBTOTAL   → total
///
/// O desconto geral incide sobre o subtotal JÁ LÍQUIDO. Aplicá-lo sobre o
/// bruto faria o abatimento do item ser contado duas vezes.

const ZERO = new Prisma.Decimal(0);
const CEM = new Prisma.Decimal(100);

export type DiscountType = 'AMOUNT' | 'PERCENT';

/// Um desconto como o usuário o informou. `AMOUNT` é em reais, `PERCENT` é a
/// porcentagem (10 = 10%).
export interface Discount {
  type: DiscountType;
  value: Prisma.Decimal | number | string;
}

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

function money(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(value);
}

function round(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/// Um item entra na conta quando o fornecedor TEM o produto e alguém já
/// informou o preço. As duas ausências têm significados diferentes e nenhuma
/// delas é zero — ver a regra C-16.
export function isQuoted(item: QuoteItem): boolean {
  return !item.unavailable && item.estimatedUnitPrice !== null;
}

/// Converte um desconto informado em reais, sobre uma base.
///
/// CLAMPA em `[0, base]`. Não é a validação — o service recusa antes, com
/// mensagem, um desconto maior que a base (ver `assertDiscountsAreValid`).
/// É a última linha de defesa: nenhuma combinação de dados legados ou de
/// corrida entre duas edições pode produzir total negativo aqui.
export function resolveDiscount(base: Prisma.Decimal, discount: Discount): Prisma.Decimal {
  const value = money(discount.value);
  if (value.lessThanOrEqualTo(0)) return ZERO;

  const resolved =
    discount.type === 'PERCENT' ? round(base.times(value).dividedBy(CEM)) : round(value);

  if (resolved.greaterThan(base)) return base;
  return resolved;
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
/// ele divergir por centavos de algo que ninguém consegue conferir na tela —
/// mesma decisão de `sumItemTotals` na ordem de compra.
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
