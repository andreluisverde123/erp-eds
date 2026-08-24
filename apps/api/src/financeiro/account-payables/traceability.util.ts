import type {
  AccountPayableOrigin,
  AccountPayableStatus,
  InvoiceStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
} from '../../../generated/prisma/client';

/// Rastreabilidade de uma conta a pagar: de onde a despesa veio.
///
/// Camada PURA — recebe a linha já carregada pelo service e devolve a origem
/// achatada. Nada aqui consulta o banco, e nada aqui é gravado: cada campo é
/// lido pelos relacionamentos que já existem
/// (`AccountPayable -> Invoice -> PurchaseOrder -> PurchaseRequest`).
///
/// Por que achatar, se a resposta já traz o objeto aninhado: a tela precisa
/// responder "qual obra originou esta despesa?" sem saber que a resposta mora
/// três níveis abaixo, e por dois caminhos diferentes (a conta avulsa tem obra
/// e não tem nota). Achatar aqui deixa essa regra em UM lugar, testável sem
/// banco, em vez de repetida em cada componente.

export interface TraceRef {
  id: string;
  code: string;
  name: string;
}

export interface TraceDocument {
  id: string;
  number: string;
  series: string | null;
}

/// Até onde a cadeia chega. É o que a tela usa para dizer "Origem: NF-e" ou
/// "Origem: lançamento manual" sem inferir a partir de campos nulos.
///
/// A ordem importa: cada valor pressupõe o anterior.
export type TraceDepth = 'MANUAL' | 'INVOICE' | 'PURCHASE_ORDER' | 'PURCHASE_REQUEST';

export interface AccountPayableTraceability {
  origin: AccountPayableOrigin;
  depth: TraceDepth;
  supplier: { id: string; legalName: string; tradeName: string | null };
  costCenter: TraceRef | null;
  constructionSite: TraceRef | null;
  invoice: (TraceDocument & { status: InvoiceStatus }) | null;
  /// A NF-e como ela chegou pela SEFAZ. Distinta da `Invoice`: esta é o
  /// documento capturado, aquela é o lançamento do financeiro.
  inboundInvoice: (TraceDocument & { accessKey: string | null }) | null;
  purchaseOrder: { id: string; code: string; status: PurchaseOrderStatus } | null;
  purchaseRequest: { id: string; code: string; status: PurchaseRequestStatus } | null;
}

/// O mínimo que `buildTraceability` precisa da linha. Declarado como interface
/// estrutural (e não a partir de `Prisma.AccountPayableGetPayload`) para o
/// teste conseguir montar o caso sem arrastar o include inteiro.
export interface TraceableAccountPayable {
  origin: AccountPayableOrigin;
  status?: AccountPayableStatus;
  supplier: { id: string; legalName: string; tradeName: string | null };
  costCenter: TraceRef | null;
  constructionSite: TraceRef | null;
  invoice: {
    id: string;
    number: string;
    series: string | null;
    status: InvoiceStatus;
    purchaseOrder: {
      id: string;
      code: string;
      status: PurchaseOrderStatus;
      purchaseRequest: { id: string; code: string; status: PurchaseRequestStatus } | null;
    } | null;
    inboundInvoices: {
      id: string;
      number: string;
      series: string | null;
      accessKey: string | null;
    }[];
  } | null;
}

export function buildTraceability(row: TraceableAccountPayable): AccountPayableTraceability {
  const order = row.invoice?.purchaseOrder ?? null;
  const request = order?.purchaseRequest ?? null;

  // Hoje a conciliação cria exatamente UMA `Invoice` por NF-e capturada, então
  // a lista tem no máximo um elemento. É uma lista no schema porque a relação
  // é 1:N do lado da nota — não porque exista o caso de duas.
  const inbound = row.invoice?.inboundInvoices[0] ?? null;

  return {
    origin: row.origin,
    depth: request
      ? 'PURCHASE_REQUEST'
      : order
        ? 'PURCHASE_ORDER'
        : row.invoice
          ? 'INVOICE'
          : 'MANUAL',
    supplier: row.supplier,
    costCenter: row.costCenter,
    // A obra vem da PRÓPRIA conta, não da travessia até a solicitação. As duas
    // dizem a mesma coisa quando a cadeia existe (a ordem copia a obra da
    // solicitação, a nota copia da ordem, a conta copia da nota), e só a
    // primeira responde para a conta avulsa, que não tem nota nenhuma.
    constructionSite: row.constructionSite,
    invoice: row.invoice
      ? {
          id: row.invoice.id,
          number: row.invoice.number,
          series: row.invoice.series,
          status: row.invoice.status,
        }
      : null,
    inboundInvoice: inbound
      ? {
          id: inbound.id,
          number: inbound.number,
          series: inbound.series,
          accessKey: inbound.accessKey,
        }
      : null,
    purchaseOrder: order ? { id: order.id, code: order.code, status: order.status } : null,
    purchaseRequest: request
      ? { id: request.id, code: request.code, status: request.status }
      : null,
  };
}
