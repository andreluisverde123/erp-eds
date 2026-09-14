import { Prisma } from '../../../generated/prisma/client';
import { toDecimal, type DecimalLike } from '../compositions/composition-cost';
import { EXACT_SCALE, MONEY_SCALE, roundMoney } from './budget-cost';

/// BDI e preço final. Módulo puro.
///
/// ## A conta
///
///   custo direto = round2(Σ exatos das linhas)          — o total do ORC-04
///   valor do BDI = round2(custo direto × BDI% ÷ 100)
///   preço final  = custo direto + valor do BDI
///
/// O BDI incide sobre o custo direto JÁ EM CENTAVOS, e o preço final é a soma
/// dos dois valores exibidos. Assim o resumo fecha na tela e no papel:
/// "R$ 1.000,00 + R$ 250,00 = R$ 1.250,00", sem um centavo que ninguém consegue
/// conferir. Aplicar o BDI sobre o exato e arredondar só no fim faria o preço
/// final diferir, às vezes, da soma das duas linhas mostradas acima dele.
///
/// Nada disso é gravado: o banco guarda só o percentual. Custo direto, valor do
/// BDI e preço final são derivados a cada leitura, como os totais do ORC-04.
///
/// ## Escala
///
/// Percentual com até 4 casas (`DECIMAL(7,4)`): 25,1234%. Zero é válido
/// (orçamento de custo, sem BDI). Negativo não.

export const BDI_SCALE = 4;
/// `DECIMAL(7,4)` guarda até 999,9999.
const BDI_LIMIT = new Prisma.Decimal('1000');

export function bdiProblem(value: unknown): string | null {
  const decimal = toDecimal(value);
  if (!decimal) return 'BDI inválido.';
  if (decimal.isNegative() && !decimal.isZero()) return 'O BDI não pode ser negativo.';
  if (decimal.decimalPlaces() > BDI_SCALE) return `O BDI aceita até ${BDI_SCALE} casas decimais.`;
  if (decimal.greaterThanOrEqualTo(BDI_LIMIT)) return 'O BDI deve ser menor que 1000%.';
  return null;
}

export interface BudgetPrice {
  directCost: string;
  directCostExact: string;
  bdiPercent: string;
  bdiValue: string;
  finalPrice: string;
}

export function budgetPrice(directExact: Prisma.Decimal, bdiPercent: DecimalLike): BudgetPrice {
  const direto = roundMoney(directExact);
  const percentual = new Prisma.Decimal(bdiPercent);
  const valorDoBdi = roundMoney(direto.times(percentual).dividedBy(100));
  return {
    directCost: direto.toFixed(MONEY_SCALE),
    directCostExact: directExact.toFixed(EXACT_SCALE),
    bdiPercent: percentual.toFixed(BDI_SCALE),
    bdiValue: valorDoBdi.toFixed(MONEY_SCALE),
    finalPrice: direto.plus(valorDoBdi).toFixed(MONEY_SCALE),
  };
}
