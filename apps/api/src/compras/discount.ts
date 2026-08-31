import { Prisma } from '../../generated/prisma/client';

/// A aritmética de desconto de Compras — e o único lugar em que ela existe.
///
/// Mora aqui, e não dentro de `purchase-requests/`, porque a SOLICITAÇÃO e a
/// ORDEM DE COMPRA aplicam o mesmo desconto em dois níveis. Duas cópias da
/// mesma conta divergiriam no primeiro arredondamento — e divergência de
/// centavo entre a cotação e a ordem é exatamente o que faz o fornecedor
/// contestar a nota.
///
/// Tudo em `Prisma.Decimal`, nunca em `number`: quantidade tem 3 casas e preço
/// tem 2, então o produto pode ter 5, e `0.1 * 3` em ponto flutuante devolve
/// `0.30000000000000004`. Num campo de dinheiro isso vira centavo errado.
/// `HALF_UP` é o arredondamento comercial brasileiro (0,005 sobe) e o mesmo
/// que o Postgres aplica ao gravar em `DECIMAL(14,2)`.
///
/// A ORDEM DAS OPERAÇÕES é a regra que este arquivo existe para não deixar
/// ninguém errar:
///
///   1. quantidade × preço unitário          → bruto da linha
///   2. − desconto do item                   → líquido da linha
///   3. Σ linhas                             → subtotal
///   4. − desconto geral, sobre o SUBTOTAL   → total
///
/// O desconto geral incide sobre o subtotal JÁ LÍQUIDO. Aplicá-lo sobre o
/// bruto faria o abatimento do item ser contado duas vezes.

export const ZERO = new Prisma.Decimal(0);
const CEM = new Prisma.Decimal(100);

export type DiscountType = 'AMOUNT' | 'PERCENT';

/// Um desconto como o usuário o informou. `AMOUNT` é em reais, `PERCENT` é a
/// porcentagem (10 = 10%).
export interface Discount {
  type: DiscountType;
  value: Prisma.Decimal | number | string;
}

export function money(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(value);
}

export function round(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/// Converte um desconto informado em reais, sobre uma base.
///
/// CLAMPA em `[0, base]`. Não é a validação — os services recusam antes, com
/// mensagem, um desconto maior que a base. É a última linha de defesa: nenhuma
/// combinação de dados legados ou de corrida entre duas edições pode produzir
/// total negativo aqui.
export function resolveDiscount(base: Prisma.Decimal, discount: Discount): Prisma.Decimal {
  const value = money(discount.value);
  if (value.lessThanOrEqualTo(0)) return ZERO;

  const resolved =
    discount.type === 'PERCENT' ? round(base.times(value).dividedBy(CEM)) : round(value);

  if (resolved.greaterThan(base)) return base;
  return resolved;
}
