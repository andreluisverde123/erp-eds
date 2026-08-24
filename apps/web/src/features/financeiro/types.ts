export type InvoiceStatus = 'RECEIVED' | 'VALIDATED' | 'CANCELLED';
export type AccountPayableStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentRecordStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'REFUNDED';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SupplierRef {
  id: string;
  legalName: string;
  tradeName: string | null;
}

/// Campos Decimal do Prisma (totalAmount, amount) vêm serializados como
/// string no JSON — nunca number. Parsear com Number() antes de calcular.
export interface Invoice {
  id: string;
  number: string;
  series: string | null;
  issueDate: string;
  totalAmount: string;
  status: InvoiceStatus;
  createdAt: string;
  supplier: SupplierRef;
  purchaseOrder: { id: string; code: string };
}

export interface InvoiceInput {
  purchaseOrderId: string;
  number: string;
  series?: string;
  issueDate: string;
  totalAmount: number;
}

export interface InvoiceQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  supplierId?: string;
  purchaseOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/// De onde a conta nasceu. `INVOICE` é o caminho de sempre (nota fiscal, com
/// ou sem ordem de compra); `MANUAL` é o lançamento direto do Financeiro.
export type AccountPayableOrigin = 'INVOICE' | 'MANUAL';

export interface AccountPayable {
  id: string;
  dueDate: string;
  amount: string;
  status: AccountPayableStatus;
  origin: AccountPayableOrigin;
  /// Sempre presente: a conta carrega o fornecedor na própria linha, tendo
  /// nota ou não.
  supplier: SupplierRef;
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
  /// Só nas contas nascidas de nota fiscal.
  invoice: { id: string; number: string; series: string | null } | null;
  /// De onde a despesa veio, achatado pela API a partir dos relacionamentos
  /// que já existiam (conta -> nota -> ordem -> solicitação). Sempre presente:
  /// no lançamento avulso os elos operacionais vêm nulos e `depth` é
  /// `MANUAL`.
  traceability: AccountPayableTraceability;
  /// Só no lançamento avulso — é a identificação dele.
  description: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

/// Até onde a cadeia da origem chega. A tela usa para dizer "Origem: NF-e" ou
/// "Origem: lançamento manual" sem deduzir a partir de campos nulos.
export type TraceDepth = 'MANUAL' | 'INVOICE' | 'PURCHASE_ORDER' | 'PURCHASE_REQUEST';

export interface TraceRef {
  id: string;
  code: string;
  name: string;
}

/// Origem operacional de uma conta a pagar. Nenhum campo aqui é uma coluna
/// nova no banco: tudo é lido por relacionamento e achatado pela API.
export interface AccountPayableTraceability {
  origin: AccountPayableOrigin;
  depth: TraceDepth;
  supplier: SupplierRef;
  costCenter: TraceRef | null;
  constructionSite: TraceRef | null;
  invoice: { id: string; number: string; series: string | null; status: string } | null;
  /// A NF-e como chegou da SEFAZ — distinta da nota do financeiro.
  inboundInvoice: {
    id: string;
    number: string;
    series: string | null;
    accessKey: string | null;
  } | null;
  purchaseOrder: { id: string; code: string; status: PurchaseOrderStatusRef } | null;
  purchaseRequest: { id: string; code: string; status: string } | null;
}

/// O status da ordem vem como texto do enum de Compras. Tipado como string
/// aqui de propósito: o Financeiro exibe o rótulo, não decide nada com ele, e
/// importar o enum de Compras acoplaria os dois módulos por causa de um badge.
export type PurchaseOrderStatusRef = string;

/// As formas que o sistema já tem. Nenhuma nova foi criada.
export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'CASH' | 'BANK_SLIP';

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BANK_SLIP', label: 'Boleto' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'CASH', label: 'Dinheiro' },
];

/// O que identifica a conta numa listagem: número da nota quando ela veio de
/// uma, descrição quando é lançamento avulso.
///
/// Assinatura ESTRUTURAL de propósito: serve tanto para a conta completa
/// quanto para o resumo que vem aninhado no pagamento, sem duplicar a regra.
export interface AccountPayableIdentity {
  invoice: { number: string; series: string | null } | null;
  description: string | null;
  documentNumber: string | null;
}

export function accountPayableLabel(account: AccountPayableIdentity): string {
  if (account.invoice) {
    return account.invoice.series
      ? `${account.invoice.number}/${account.invoice.series}`
      : account.invoice.number;
  }
  return account.description ?? account.documentNumber ?? '—';
}

export interface AccountPayableInput {
  supplierId: string;
  description: string;
  costCenterId: string;
  amount: number;
  dueDate: string;
  issueDate?: string;
  paymentMethod?: PaymentMethod;
  documentNumber?: string;
  notes?: string;
}

export interface AccountPayableDetail extends AccountPayable {
  payments: Payment[];
}

export interface AccountPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountPayableStatus;
  supplierId?: string;
  origin?: AccountPayableOrigin;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface AccountPayableSummary {
  totalOpen: number;
  totalPaid: number;
  dueToday: number;
  dueThisWeek: number;
}

export interface Payment {
  id: string;
  amount: string;
  paidAt: string;
  method: string | null;
  status: PaymentRecordStatus;
  accountPayable: {
    id: string;
    supplier: SupplierRef;
    invoice: { id: string; number: string; series: string | null } | null;
    description: string | null;
    documentNumber: string | null;
  };
}

export interface PaymentInput {
  accountPayableId: string;
  amount: number;
  paidAt: string;
  method?: string;
  status?: PaymentRecordStatus;
}

export interface PaymentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PaymentRecordStatus;
  accountPayableId?: string;
}
