import { Prisma } from '../../generated/prisma/client';

/// O ATENDIMENTO de uma solicitação de compra — e o único lugar em que a conta
/// existe.
///
/// Mora aqui, ao lado de `discount.ts`, porque as DUAS pontas precisam dela: a
/// solicitação, para dizer quanto ainda falta comprar, e a ordem de compra,
/// para recusar quem tentar comprar mais do que foi pedido. Duas cópias
/// divergiriam, e divergência aqui significa material comprado a mais sem
/// ninguém perceber.
///
/// **Nada disto é gravado.** Não existe coluna de "quantidade atendida", e não
/// deve existir: a informação já está inteira em `PurchaseOrderItem`, que
/// aponta para a linha pedida (`purchaseRequestItemId`), diz quanto foi
/// comprado (`quantity`) e por qual ordem. Uma coluna espelhando isso seria um
/// segundo número para o mesmo fato, e o dia em que os dois divergissem
/// ninguém saberia qual está certo. Mesmo princípio que a regra C-20 já aplica
/// ao total da cotação.
///
/// **`PurchaseOrderItem` É a entidade de atendimento.** Não foi criada nenhuma
/// tabela intermediária: ela duplicaria a quantidade e, pior, quebraria a
/// conciliação de notas, que compara a NF-e contra os itens DA ORDEM.

/// Em que pé está uma linha (ou a solicitação inteira).
///
/// Deliberadamente FORA do enum `PurchaseRequestStatus`: aquele campo é o
/// fluxo de aprovação (rascunho → cotação → aprovada), e atendimento é outro
/// eixo. Uma solicitação aprovada pode estar pendente, parcial ou atendida, e
/// misturar as duas coisas num campo só obrigaria a inventar transições que a
/// regra C-1 não tem.
export type FulfillmentStatus = 'PENDING' | 'PARTIAL' | 'FULFILLED';

/// Uma compra que atendeu (parte de) uma linha da solicitação.
export interface FulfillmentEntry {
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierName: string;
  quantity: Prisma.Decimal;
}

export interface ItemFulfillment {
  requestedQuantity: Prisma.Decimal;
  fulfilledQuantity: Prisma.Decimal;
  /// Nunca negativo — ver `pendingOf`.
  pendingQuantity: Prisma.Decimal;
  status: FulfillmentStatus;
  /// Quais ordens atenderam esta linha, na ordem em que foram emitidas. É o
  /// que responde "necessidade → compra → fornecedor → quantidade" sem sair da
  /// tela da solicitação.
  entries: FulfillmentEntry[];
}

export interface RequestFulfillment {
  status: FulfillmentStatus;
  /// Contagem de LINHAS, não de unidades: é o número que responde "quanto
  /// ainda falta comprar?" numa olhada. O valor em reais não serve para isso —
  /// o preço da ordem é o negociado e diverge do cotado por decisão de
  /// negócio, então "R$ X de R$ Y" mediria duas coisas diferentes.
  totalItems: number;
  fulfilledItems: number;
  pendingItems: number;
}

const ZERO = new Prisma.Decimal(0);

function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/// O pendente de uma linha, com piso em zero.
///
/// O piso não é preciosismo: as ordens emitidas ANTES desta regra nunca foram
/// conferidas contra a quantidade pedida, então uma solicitação pode já ter
/// mais comprado do que pedido. Um pendente negativo apareceria na tela como
/// "−12 pendentes" e, pior, deixaria o formulário da nova ordem aceitar um
/// limite negativo. A regra nova vale daqui em diante; o passado ela mostra
/// como atendido, que é o que ele é.
export function pendingOf(
  requested: Prisma.Decimal | number | string,
  fulfilled: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const pendente = toDecimal(requested).minus(toDecimal(fulfilled));
  return pendente.isNegative() ? ZERO : pendente;
}

export function statusOf(
  requested: Prisma.Decimal | number | string,
  fulfilled: Prisma.Decimal | number | string,
): FulfillmentStatus {
  const pedido = toDecimal(requested);
  const atendido = toDecimal(fulfilled);

  if (atendido.lessThanOrEqualTo(0)) return 'PENDING';
  if (atendido.greaterThanOrEqualTo(pedido)) return 'FULFILLED';
  return 'PARTIAL';
}

/// O atendimento de UMA linha, a partir das compras que apontam para ela.
export function buildItemFulfillment(
  requestedQuantity: Prisma.Decimal | number | string,
  entries: FulfillmentEntry[],
): ItemFulfillment {
  const requested = toDecimal(requestedQuantity);
  const fulfilled = entries.reduce((total, entry) => total.plus(entry.quantity), ZERO);

  return {
    requestedQuantity: requested,
    fulfilledQuantity: fulfilled,
    pendingQuantity: pendingOf(requested, fulfilled),
    status: statusOf(requested, fulfilled),
    entries,
  };
}

/// O estado AGREGADO da solicitação, a partir do de cada linha.
///
/// A regra é a mais conservadora possível, e é a que a demanda exige: a
/// solicitação só é ATENDIDA quando não sobra saldo em linha nenhuma. Basta
/// uma lata de tinta pendente para ela continuar em atendimento — inclusive
/// quando o item está marcado como indisponível na cotação, porque
/// indisponível é uma informação do fornecedor daquela cotação, não uma
/// desistência de quem pediu.
export function aggregateFulfillment(items: ItemFulfillment[]): RequestFulfillment {
  const totalItems = items.length;
  const fulfilledItems = items.filter((item) => item.status === 'FULFILLED').length;

  // Solicitação sem linha nenhuma não tem o que atender. PENDING (e não
  // FULFILLED) porque "atendida" afirmaria uma compra que nunca houve.
  const status: FulfillmentStatus =
    totalItems === 0
      ? 'PENDING'
      : fulfilledItems === totalItems
        ? 'FULFILLED'
        : items.some((item) => item.status !== 'PENDING')
          ? 'PARTIAL'
          : 'PENDING';

  return {
    status,
    totalItems,
    fulfilledItems,
    pendingItems: totalItems - fulfilledItems,
  };
}
