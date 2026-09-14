import { Prisma } from '../../../generated/prisma/client';
import { ZERO } from '../../compras/discount';

/// A aritmética da composição de custo — e o único lugar em que ela existe.
///
/// Módulo puro, sem Prisma Client e sem Nest: o custo de uma composição é uma
/// regra, não uma consulta, e precisa poder ser testado sem banco. É o mesmo
/// arranjo de `compras/discount.ts`, de onde vem o `ZERO`.
///
/// ## A conta
///
///   custo do item      = coeficiente × preço unitário
///   custo unitário     = Σ custo dos itens
///
/// Tudo em `Prisma.Decimal`, nunca em `number`: `0.1 * 3` em ponto flutuante
/// devolve `0.30000000000000004`.
///
/// ## As escalas
///
/// - coeficiente: **6 casas**, `DECIMAL(14,6)`. Base referencial chega a
///   0,000123 m³/m².
/// - preço unitário: **4 casas**, `DECIMAL(14,4)`, como o preço unitário da
///   NF-e e do contrato por unidade.
/// - custo do item e custo unitário: **4 casas**, `HALF_UP`.
///
/// **Por que o custo não é arredondado para centavos aqui.** Um coeficiente
/// de 0,000123 × R$ 50,00 dá R$ 0,00615. Arredondar cada item para 2 casas o
/// transformaria em R$ 0,01 — 63% a mais —, e numa composição com dezenas de
/// linhas assim o erro se acumula antes de alguém multiplicar pela quantidade
/// do orçamento. Quatro casas preservam o valor e ainda somam exato: o custo
/// unitário é a soma dos custos de item JÁ ARREDONDADOS, então o total que a
/// tela mostra é sempre a soma das linhas que ela mostra. O arredondamento
/// para centavos pertence ao documento — o orçamento (ORC-04) —, não ao
/// cadastro.

export const COEFFICIENT_SCALE = 6;
export const PRICE_SCALE = 4;
export const COST_SCALE = 4;

/// Limites das colunas: DECIMAL(14,6) guarda até 8 dígitos inteiros e
/// DECIMAL(14,4), até 10. Acima disso o Postgres recusa com erro cru.
const COEFFICIENT_LIMIT = new Prisma.Decimal('100000000');
const PRICE_LIMIT = new Prisma.Decimal('10000000000');

export type DecimalLike = Prisma.Decimal | number | string;

export interface CostLine {
  coefficient: DecimalLike;
  unitPrice: DecimalLike;
}

/// Converte o que veio da requisição, ou `null` se não for um número finito.
///
/// String é aceita além de number: é a forma de mandar "0.000123" sem passar
/// pela representação binária do JavaScript.
export function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value instanceof Prisma.Decimal) return value.isFinite() ? value : null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;

  try {
    const decimal = new Prisma.Decimal(typeof value === 'string' ? value.trim() : value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

export function itemCost(coefficient: DecimalLike, unitPrice: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(coefficient)
    .times(new Prisma.Decimal(unitPrice))
    .toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/// Custo de produzir UMA unidade da composição. Sem itens, zero.
export function unitCost(lines: CostLine[]): Prisma.Decimal {
  return lines.reduce(
    (total, line) => total.plus(itemCost(line.coefficient, line.unitPrice)),
    ZERO,
  );
}

/// O que há de errado com um coeficiente, ou `null` se estiver certo.
///
/// Maior que ZERO, e não "não negativo": um item com coeficiente zero não
/// consome nada e não custa nada. Ele só ocupa a linha — quem quer tirar o
/// insumo da composição remove o item.
export function coefficientProblem(value: unknown): string | null {
  const decimal = toDecimal(value);
  if (!decimal) return 'Coeficiente inválido.';
  if (decimal.lessThanOrEqualTo(0)) return 'O coeficiente deve ser maior que zero.';
  if (decimal.decimalPlaces() > COEFFICIENT_SCALE) {
    return `O coeficiente aceita até ${COEFFICIENT_SCALE} casas decimais.`;
  }
  if (decimal.greaterThanOrEqualTo(COEFFICIENT_LIMIT)) {
    return 'Coeficiente excede o limite permitido.';
  }
  return null;
}

/// O que há de errado com um preço unitário, ou `null` se estiver certo.
///
/// ZERO é aceito: um recurso próprio já pago (a betoneira da empresa, por
/// exemplo) entra na composição para registrar o consumo sem somar custo.
export function unitPriceProblem(value: unknown): string | null {
  const decimal = toDecimal(value);
  if (!decimal) return 'Preço unitário inválido.';
  if (decimal.isNegative() && !decimal.isZero()) {
    return 'O preço unitário não pode ser negativo.';
  }
  if (decimal.decimalPlaces() > PRICE_SCALE) {
    return `O preço unitário aceita até ${PRICE_SCALE} casas decimais.`;
  }
  if (decimal.greaterThanOrEqualTo(PRICE_LIMIT)) {
    return 'Preço unitário excede o limite permitido.';
  }
  return null;
}
