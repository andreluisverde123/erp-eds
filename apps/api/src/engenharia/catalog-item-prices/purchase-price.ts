import { Prisma } from '../../../generated/prisma/client';
import { PRICE_SCALE, type DecimalLike } from '../compositions/composition-cost';
import { dateToDateOnly } from './reference-date';

/// O preço PRATICADO numa linha de ordem de compra, e quando ele pode virar
/// referência. Módulo puro.
///
/// ## A conta
///
/// A linha grava `totalPrice` = quantidade × preço − desconto da linha. A
/// ordem grava `totalAmount` = Σ linhas − desconto geral. O desconto geral é
/// da ordem inteira, e a parte que cabe a cada linha é proporcional ao valor
/// dela:
///
///   parte da linha   = totalPrice × (totalAmount ÷ Σ totalPrice)
///   preço praticado  = parte da linha ÷ quantidade      (4 casas, HALF_UP)
///
/// Usa os valores GRAVADOS, e não os recalcula: são os que o documento
/// enviado ao fornecedor e o financeiro mostram.
///
/// O `unitPrice` bruto da linha não é o praticado. Com 10% de desconto, o
/// cimento "de R$ 40,00" custou R$ 36,00, e uma referência de R$ 40,00 faria
/// toda composição nova nascer 11% cara.

export type PurchaseLineBlock =
  | 'ORDER_NOT_RECEIVED'
  | 'UNIT_MISMATCH'
  | 'INCONSISTENT_TOTALS'
  | 'FUTURE_DATE'
  | 'ALREADY_REGISTERED';

export const PURCHASE_BLOCK_MESSAGES: Record<PurchaseLineBlock, string> = {
  ORDER_NOT_RECEIVED:
    'Só o preço de ordem de compra RECEBIDA pode virar referência: antes disso a compra ainda pode mudar.',
  UNIT_MISMATCH:
    'A linha da compra está numa unidade diferente da do insumo. O ERP não converte unidades, então este preço não pode virar referência.',
  INCONSISTENT_TOTALS:
    'Os totais desta ordem não fecham com as linhas dela, e o preço praticado não pode ser calculado com segurança.',
  FUTURE_DATE: 'A ordem tem data de emissão futura; um preço de referência não pode ser futuro.',
  ALREADY_REGISTERED: 'O preço desta linha de compra já está no histórico.',
};

export interface PurchaseLine {
  quantity: DecimalLike;
  totalPrice: DecimalLike;
  unit: string;
  purchaseOrder: {
    status: string;
    issueDate: Date;
    totalAmount: DecimalLike;
    items: { totalPrice: DecimalLike }[];
  };
}

export interface PurchaseLineEvaluation {
  /// Nulo quando não há como calcular (quantidade zero, totais incoerentes).
  unitPrice: Prisma.Decimal | null;
  /// O dia de emissão da ordem: é quando o preço foi negociado.
  referenceDate: string;
  block: PurchaseLineBlock | null;
}

export function practicedUnitPrice(line: PurchaseLine): Prisma.Decimal | null {
  const quantidade = new Prisma.Decimal(line.quantity);
  if (quantidade.lessThanOrEqualTo(0)) return null;

  const subtotal = line.purchaseOrder.items.reduce(
    (soma, item) => soma.plus(new Prisma.Decimal(item.totalPrice)),
    new Prisma.Decimal(0),
  );
  const total = new Prisma.Decimal(line.purchaseOrder.totalAmount);
  const liquidoDaLinha = new Prisma.Decimal(line.totalPrice);

  // Desconto geral não aumenta valor, e total negativo não existe. Fora disso
  // os números não são desta ordem — uma ordem legada sem linhas coerentes,
  // por exemplo — e ratear seria inventar.
  if (total.isNegative() || total.greaterThan(subtotal)) return null;
  if (subtotal.isZero()) return new Prisma.Decimal(0);

  return liquidoDaLinha
    .times(total)
    .dividedBy(subtotal)
    .dividedBy(quantidade)
    .toDecimalPlaces(PRICE_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/// Pode esta linha virar preço de referência do insumo?
///
/// - ordem RECEBIDA: é o único status em que o próprio ERP afirma que a compra
///   aconteceu. Aberta ou emitida ainda pode mudar; cancelada não aconteceu.
/// - mesma unidade do insumo, comparada EXATAMENTE: a linha de compra guarda a
///   unidade dela, que pode divergir do cadastro (ORC-01), e o ERP não
///   converte.
/// - totais coerentes, para o rateio do desconto geral existir.
/// - data de emissão que não seja futura.
export function evaluatePurchaseLine(
  line: PurchaseLine,
  catalogUnit: string,
  today: string,
): PurchaseLineEvaluation {
  const referenceDate = dateToDateOnly(line.purchaseOrder.issueDate);
  const unitPrice = practicedUnitPrice(line);

  let block: PurchaseLineBlock | null = null;
  if (line.purchaseOrder.status !== 'RECEIVED') block = 'ORDER_NOT_RECEIVED';
  else if (line.unit !== catalogUnit) block = 'UNIT_MISMATCH';
  else if (unitPrice === null) block = 'INCONSISTENT_TOTALS';
  else if (referenceDate > today) block = 'FUTURE_DATE';

  return { unitPrice, referenceDate, block };
}
