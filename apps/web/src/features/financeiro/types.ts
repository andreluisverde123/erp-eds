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

export interface AccountPayable {
  id: string;
  dueDate: string;
  amount: string;
  status: AccountPayableStatus;
  invoice: { id: string; number: string; series: string | null; supplier: SupplierRef };
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
  accountPayable: { id: string; invoice: { id: string; number: string; supplier: SupplierRef } };
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
