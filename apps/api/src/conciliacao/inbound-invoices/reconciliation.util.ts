import { Prisma } from '../../../generated/prisma/client';
import { addDays } from '../../common/utils/date.util';
import type { PaymentTerms } from '../../../generated/prisma/client';

/// Tolerância de valor para considerar uma ordem de compra "compatível" com a
/// nota. 10% cobre o que normalmente separa o pedido da nota em obra — frete,
/// arredondamento de quantidade, imposto que entrou depois. Acima disso a
/// ordem ainda aparece na lista para escolha manual, mas não como sugestão.
const AMOUNT_TOLERANCE = 0.1;

/// Janela de data. Uma nota costuma ser emitida perto do pedido, mas material
/// de obra atrasa: 90 dias para trás cobre entrega parcelada sem trazer o
/// pedido do semestre passado.
const DATE_WINDOW_DAYS = 90;

export interface SuggestionCandidate {
  id: string;
  totalAmount: Prisma.Decimal;
  issueDate: Date;
  reconciledAmount: Prisma.Decimal;
}

export interface SuggestionScore {
  /// 0 a 1. Combina proximidade de valor e de data; só é calculado para
  /// ordens do MESMO fornecedor — fornecedor diferente não é sugestão, é
  /// escolha manual do usuário.
  score: number;
  amountDifference: Prisma.Decimal;
  daysApart: number;
  /// A ordem cabe dentro da tolerância de valor E da janela de data.
  withinTolerance: boolean;
}

export function scoreCandidate(
  invoiceAmount: Prisma.Decimal,
  invoiceIssueDate: Date,
  candidate: SuggestionCandidate,
): SuggestionScore {
  // O que a ordem ainda tem em aberto, não o total dela: uma OC de 100 mil que
  // já recebeu 90 mil em notas deve casar com uma nota de 10 mil, não de 100.
  const open = candidate.totalAmount.minus(candidate.reconciledAmount);
  const amountDifference = invoiceAmount.minus(open);
  const reference = open.abs().greaterThan(0) ? open.abs() : new Prisma.Decimal(1);
  const amountRatio = amountDifference.abs().dividedBy(reference).toNumber();

  const daysApart = Math.round(
    Math.abs(invoiceIssueDate.getTime() - candidate.issueDate.getTime()) / 86_400_000,
  );

  // Cada eixo vira uma nota de 0 a 1 que decai linearmente até o limite.
  const amountScore = Math.max(0, 1 - amountRatio / AMOUNT_TOLERANCE);
  const dateScore = Math.max(0, 1 - daysApart / DATE_WINDOW_DAYS);

  // Valor pesa mais que data: uma nota com o valor exato de um pedido de dois
  // meses atrás é um casamento melhor que uma de valor solto emitida ontem.
  const score = amountScore * 0.7 + dateScore * 0.3;

  return {
    score,
    amountDifference,
    daysApart,
    withinTolerance: amountRatio <= AMOUNT_TOLERANCE && daysApart <= DATE_WINDOW_DAYS,
  };
}

/// Quantas parcelas cada condição gera e com que deslocamento em dias a partir
/// da data-base. "30/60/90" gera TRÊS parcelas de contas a pagar, não uma de
/// valor cheio — é a diferença entre o financeiro ver três vencimentos na
/// agenda e ser surpreendido por um só.
const TERM_OFFSETS: Record<PaymentTerms, number[]> = {
  CASH: [0],
  NET_30: [30],
  NET_30_60: [30, 60],
  NET_30_60_90: [30, 60, 90],
};

export interface Installment {
  dueDate: Date;
  amount: Prisma.Decimal;
}

/// Divide o total da nota nas parcelas da condição escolhida.
///
/// A divisão é feita em CENTAVOS e a sobra vai toda para a última parcela:
/// R$ 100,00 em três vezes vira 33,33 + 33,33 + 33,34, nunca 33,33 três vezes
/// (que perderia um centavo) nem 33,34 três vezes (que cobraria dois a mais).
/// A soma das parcelas é exatamente o valor da nota, sempre.
export function buildInstallments(
  totalAmount: Prisma.Decimal,
  terms: PaymentTerms,
  baseDate: Date,
): Installment[] {
  // `?? [0]` só existe para o `noUncheckedIndexedAccess`: o Record cobre todos
  // os valores do enum, então na prática nunca cai no fallback.
  const offsets = TERM_OFFSETS[terms] ?? [0];
  const totalCents = BigInt(totalAmount.times(100).toFixed(0));
  const count = BigInt(offsets.length);
  const perInstallment = totalCents / count;
  const remainder = totalCents - perInstallment * count;

  return offsets.map((offset, index) => {
    const isLast = index === offsets.length - 1;
    const cents = isLast ? perInstallment + remainder : perInstallment;
    return {
      dueDate: addDays(baseDate, offset),
      amount: new Prisma.Decimal(cents.toString()).dividedBy(100),
    };
  });
}
