export type InboundInvoiceStatus = 'PENDING' | 'RECONCILED' | 'DIVERGENT' | 'CANCELLED';
export type InboundInvoiceSource = 'MANUAL' | 'XML_IMPORT' | 'SEFAZ';
export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'CASH' | 'BANK_SLIP';
export type PaymentTerms = 'CASH' | 'NET_30' | 'NET_30_60' | 'NET_30_60_90';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SupplierRef {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
}

export interface InboundInvoiceItem {
  id: string;
  /// Posição do item na nota — a ordem em que o financeiro confere.
  itemNumber: number | null;
  /// Código no catálogo do EMITENTE, não no nosso.
  code: string | null;
  description: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
}

/// Nota fiscal recebida. Campos Decimal do Prisma (`totalAmount`, valores dos
/// itens) chegam como string no JSON — nunca number. Parsear com Number()
/// antes de calcular.
///
/// `supplierName`/`supplierDocument` são o que veio NO DOCUMENTO; `supplier` é
/// o cadastro que casou com aquele CNPJ, e é `null` quando o emitente não está
/// cadastrado — caso em que a conciliação não consegue sugerir ordem nenhuma.
export interface InboundInvoice {
  id: string;
  supplierName: string;
  supplierDocument: string;
  supplierId: string | null;
  number: string;
  series: string | null;
  accessKey: string | null;
  issueDate: string;
  totalAmount: string;
  /// Dados que só o documento COMPLETO traz. Nulos enquanto a SEFAZ só
  /// entregou o resumo (ver `hasFullDocument`).
  supplierTradeName: string | null;
  supplierIe: string | null;
  supplierAddress: string | null;
  supplierCity: string | null;
  supplierState: string | null;
  supplierZipCode: string | null;
  productsAmount: string | null;
  freightAmount: string | null;
  discountAmount: string | null;
  icmsAmount: string | null;
  ipiAmount: string | null;
  pisAmount: string | null;
  cofinsAmount: string | null;
  additionalInfo: string | null;
  protocolNumber: string | null;
  /// `false` significa que só o RESUMO chegou: a nota não tem itens ainda, e
  /// a tela precisa dizer isso em vez de mostrar lista vazia como se a nota
  /// não tivesse produtos.
  hasFullDocument: boolean;
  cancelledAt: string | null;
  status: InboundInvoiceStatus;
  source: InboundInvoiceSource;
  xmlPath: string | null;
  pdfPath: string | null;
  purchaseOrderId: string | null;
  invoiceId: string | null;
  reconciledAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentTerms: PaymentTerms | null;
  notes: string | null;
  createdAt: string;
  supplier: SupplierRef | null;
  purchaseOrder: { id: string; code: string; totalAmount: string } | null;
}

/// Ordem de compra como vem no DETALHE de uma nota já conciliada — completa,
/// não só id/código. É ela que preenche o lado direito da comparação quando
/// não há mais sugestões a buscar.
export interface LinkedPurchaseOrder {
  id: string;
  code: string;
  totalAmount: string;
  issueDate: string;
  supplier: { id: string; legalName: string; tradeName: string | null };
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
  purchaseRequest: {
    items: {
      description: string;
      quantity: string;
      unit: string;
      estimatedUnitPrice: string | null;
    }[];
  };
}

export interface InboundInvoiceDetail extends Omit<InboundInvoice, 'purchaseOrder'> {
  purchaseOrder: LinkedPurchaseOrder | null;
  items: InboundInvoiceItem[];
  reconciledBy: { id: string; name: string } | null;
  invoice: { id: string; number: string; status: string } | null;
}

/// Ordem de compra candidata. `score` (0 a 1) combina proximidade de valor e
/// de data; `isPrimary` só vem marcado quando a melhor candidata é claramente
/// melhor que a segunda — em empate técnico nenhuma é sugerida.
export interface PurchaseOrderSuggestion {
  id: string;
  code: string;
  issueDate: string;
  totalAmount: string;
  reconciledAmount: string;
  openAmount: string;
  supplier: { id: string; legalName: string; tradeName: string | null };
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
  items: {
    description: string;
    quantity: string;
    unit: string;
    estimatedUnitPrice: string | null;
  }[];
  score: number;
  amountDifference: string;
  daysApart: number;
  withinTolerance: boolean;
  isPrimary: boolean;
}

export interface InboundInvoiceQuery {
  page?: number;
  limit?: number;
  search?: string;
  supplierId?: string;
  status?: InboundInvoiceStatus;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}

export interface InboundInvoiceItemInput {
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InboundInvoiceInput {
  supplierName: string;
  supplierDocument: string;
  number: string;
  series?: string;
  accessKey?: string;
  issueDate: string;
  totalAmount: number;
  items?: InboundInvoiceItemInput[];
}

/// Ordem de compra em aberto, para escolha MANUAL — sem filtro de fornecedor.
/// Diferente de `PurchaseOrderSuggestion`, que é o que o sistema recomenda.
export interface OpenPurchaseOrder {
  id: string;
  code: string;
  issueDate: string;
  totalAmount: string;
  reconciledAmount: string;
  openAmount: string;
  supplier: { id: string; legalName: string; tradeName: string | null };
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
}

export interface CostCenterOption {
  id: string;
  code: string;
  name: string;
  constructionSite: { id: string; code: string; name: string } | null;
}

export interface ReconcileInput {
  /// Ausente na compra de balcão, que não tem ordem.
  purchaseOrderId?: string;
  /// Obrigatório quando não há ordem de compra: é ele que diz a que a despesa
  /// pertence.
  costCenterId?: string;
  paymentMethod: PaymentMethod;
  paymentTerms: PaymentTerms;
  dueDate?: string;
  notes?: string;
  /// Só é enviado depois que o usuário confirmou a divergência na tela. A API
  /// recusa a conciliação divergente sem este aceite.
  acceptDivergence?: boolean;
}
