import { Prisma } from '../../../generated/prisma/client';
import { ZERO } from '../../compras/discount';
import { toDecimal, type DecimalLike } from '../compositions/composition-cost';

/// A aritmética do orçamento. Módulo puro.
///
/// ## Escalas
///
/// | Valor | Escala | Por quê |
/// | --- | --- | --- |
/// | quantidade | 4 casas, `DECIMAL(14,4)` | 123,4567 m³ cabe; a mesma escala do custo |
/// | custo unitário | 4 casas, `DECIMAL(14,4)` | a do preço da composição e da referência (ORC-02/03) |
/// | total EXATO | até 8 casas | quantidade × custo, sem arredondar |
/// | valor MONETÁRIO exibido | 2 casas, `HALF_UP` | centavos |
///
/// ## A regra de arredondamento — decidida aqui, e só aqui
///
/// **Soma-se o EXATO e arredonda-se uma vez, no nível que se mostra.**
///
///   total da linha     = round2(quantidade × custo)
///   subtotal do nó     = round2(Σ exatos das linhas do nó e dos descendentes)
///   total do orçamento = round2(Σ exatos de todas as linhas)
///
/// Nunca se soma um valor já arredondado. Arredondar linha a linha e somar os
/// centavos faria o total do orçamento depender de como as linhas foram
/// agrupadas: 3 × R$ 0,3333 arredondadas dão R$ 0,99; a soma exata, R$ 1,00. E
/// o mesmo serviço, dividido em 100 linhas ou numa só, daria totais diferentes.
///
/// A consequência visível, assumida e explicada na tela: a soma dos totais de
/// linha exibidos pode diferir do subtotal em alguns centavos — no máximo meio
/// centavo por linha. O subtotal e o total estão certos; as linhas estão
/// arredondadas.
///
/// `HALF_UP` é o arredondamento comercial e o de `compras/discount.ts`.

export const QUANTITY_SCALE = 4;
export const UNIT_COST_SCALE = 4;
export const MONEY_SCALE = 2;
export const EXACT_SCALE = 8;

const QUANTITY_LIMIT = new Prisma.Decimal('10000000000');
const UNIT_COST_LIMIT = new Prisma.Decimal('10000000000');

export function lineTotalExact(quantity: DecimalLike, unitCost: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(quantity).times(new Prisma.Decimal(unitCost));
}

export function sumExact(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, valor) => total.plus(valor), ZERO);
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/// Os dois textos que a API devolve para um valor: o monetário e o exato.
export function moneyPair(exact: Prisma.Decimal): { amount: string; exact: string } {
  return { amount: roundMoney(exact).toFixed(MONEY_SCALE), exact: exact.toFixed(EXACT_SCALE) };
}

/// Maior que zero, até 4 casas. Linha com quantidade zero não orça nada — é
/// para remover.
export function quantityProblem(value: unknown): string | null {
  const decimal = toDecimal(value);
  if (!decimal) return 'Quantidade inválida.';
  if (decimal.lessThanOrEqualTo(0)) return 'A quantidade deve ser maior que zero.';
  if (decimal.decimalPlaces() > QUANTITY_SCALE) {
    return `A quantidade aceita até ${QUANTITY_SCALE} casas decimais.`;
  }
  if (decimal.greaterThanOrEqualTo(QUANTITY_LIMIT)) return 'Quantidade excede o limite permitido.';
  return null;
}

/// Zero ou positivo, até 4 casas.
export function unitCostProblem(value: unknown): string | null {
  const decimal = toDecimal(value);
  if (!decimal) return 'Custo unitário inválido.';
  if (decimal.isNegative() && !decimal.isZero()) return 'O custo unitário não pode ser negativo.';
  if (decimal.decimalPlaces() > UNIT_COST_SCALE) {
    return `O custo unitário aceita até ${UNIT_COST_SCALE} casas decimais.`;
  }
  if (decimal.greaterThanOrEqualTo(UNIT_COST_LIMIT)) {
    return 'Custo unitário excede o limite permitido.';
  }
  return null;
}
