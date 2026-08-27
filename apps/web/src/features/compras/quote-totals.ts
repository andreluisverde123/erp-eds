import type { DiscountType, PurchaseRequestItem } from './types';

/// A mesma conta de `apps/api/src/compras/purchase-requests/quote-totals.ts`,
/// para a tela mostrar o resultado ENQUANTO o usuário digita.
///
/// O servidor continua sendo a fonte da verdade — o que volta do `PATCH
/// /quote` é o que vale, e é ele que a tela exibe depois de salvar. Isto aqui
/// existe só para o número não ficar parado até o próximo round-trip.
///
/// TUDO EM CENTAVOS INTEIROS. `0.1 + 0.2` em ponto flutuante dá
/// `0.30000000000000004`, e uma soma de vinte linhas erra o centavo que o
/// comprador confere na tela. Arredondar cada etapa com `Math.round` sobre
/// inteiros reproduz o HALF_UP que o backend aplica com `Prisma.Decimal`.
///
/// A ORDEM é a mesma, e é a regra que não pode divergir:
///   1. quantidade × preço unitário  → bruto da linha
///   2. − desconto do item           → líquido da linha
///   3. Σ linhas                     → subtotal
///   4. − desconto geral, sobre o subtotal já líquido → total

export interface Discount {
  type: DiscountType;
  /// String crua do input ("1050.5"), como os `NumberInput` desta base
  /// entregam. Vazio é ausência de desconto.
  value: string;
}

export const NO_DISCOUNT: Discount = { type: 'AMOUNT', value: '' };

export interface QuoteLine {
  /// `quantidade × preço unitário`, em centavos.
  gross: number;
  /// O desconto da linha já resolvido, em centavos.
  discount: number;
  /// `gross − discount`, em centavos.
  net: number;
}

export interface QuoteTotals {
  itemsSubtotal: number;
  itemsDiscount: number;
  subtotalAfterItemDiscounts: number;
  generalDiscount: number;
  total: number;
}

/// Centavos a partir da string crua de um input de dinheiro.
function toCents(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

/// Um item entra na conta quando o fornecedor TEM o produto e há preço. As
/// duas ausências têm significados diferentes, e nenhuma delas é zero.
export function isQuotedRow(available: boolean, price: string): boolean {
  return available && price.trim() !== '';
}

/// Converte um desconto informado em centavos, sobre uma base em centavos.
/// Clampa em `[0, base]` — o backend recusa com mensagem antes disso, mas a
/// tela nunca deve exibir um total negativo enquanto alguém digita.
export function resolveDiscount(baseCents: number, discount: Discount): number {
  const raw = Number(discount.value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  const resolved =
    discount.type === 'PERCENT' ? Math.round((baseCents * raw) / 100) : Math.round(raw * 100);

  return Math.min(Math.max(resolved, 0), baseCents);
}

export function calculateLine(
  quantity: string,
  price: string,
  available: boolean,
  discount: Discount,
): QuoteLine {
  if (!isQuotedRow(available, price)) {
    return { gross: 0, discount: 0, net: 0 };
  }

  const gross = Math.round(Number(quantity) * toCents(price));
  const resolved = resolveDiscount(gross, discount);

  return { gross, discount: resolved, net: gross - resolved };
}

export function calculateTotals(lines: QuoteLine[], generalDiscount: Discount): QuoteTotals {
  const itemsSubtotal = lines.reduce((soma, linha) => soma + linha.gross, 0);
  const itemsDiscount = lines.reduce((soma, linha) => soma + linha.discount, 0);
  const subtotalAfterItemDiscounts = itemsSubtotal - itemsDiscount;
  const resolvedGeneral = resolveDiscount(subtotalAfterItemDiscounts, generalDiscount);

  return {
    itemsSubtotal,
    itemsDiscount,
    subtotalAfterItemDiscounts,
    generalDiscount: resolvedGeneral,
    total: subtotalAfterItemDiscounts - resolvedGeneral,
  };
}

/// O desconto já gravado, no formato que os inputs da grade usam. Zero vira
/// campo VAZIO, não "0,00": um zero digitado e um campo em branco significam
/// a mesma coisa, e o branco não sugere que alguém informou desconto.
export function discountFromItem(item: PurchaseRequestItem): Discount {
  return Number(item.discountValue) > 0
    ? { type: item.discountType, value: item.discountValue }
    : { ...NO_DISCOUNT, type: item.discountType };
}
