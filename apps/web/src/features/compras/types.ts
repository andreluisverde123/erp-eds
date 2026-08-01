export type PurchaseRequestStatus = 'DRAFT' | 'PENDING' | 'QUOTING' | 'APPROVED' | 'CANCELLED';
export type PurchaseOrderStatus = 'OPEN' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Supplier {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  legalName: string;
  tradeName?: string;
  document: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
}

export interface SupplierQuery {
  page?: number;
  limit?: number;
  search?: string;
}

/// Campos Decimal do Prisma (quantity, estimatedUnitPrice, totalAmount) vêm
/// serializados como string no JSON — nunca number. Parsear com Number()/
/// parseFloat() antes de usar em cálculos ou formatação.
export interface PurchaseRequestItem {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  estimatedUnitPrice: string | null;
  notes: string | null;
}

export interface PurchaseRequestItemInput {
  description: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number;
  notes?: string;
}

interface ConstructionSiteRef {
  id: string;
  code: string;
  name: string;
}

interface CostCenterRef {
  id: string;
  code: string;
  name: string;
}

export interface PurchaseRequestListItem {
  id: string;
  code: string;
  status: PurchaseRequestStatus;
  notes: string | null;
  createdAt: string;
  /// Derivada do centro de custo pela API — nula quando o destino não é uma
  /// obra (Escritório, Fazenda...). O formulário não pergunta mais a obra.
  constructionSite: ConstructionSiteRef | null;
  costCenter: CostCenterRef;
  requestedBy: { id: string; name: string };
  estimatedTotal: number;
}

export interface AuditLogEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changes: unknown;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export interface PurchaseRequestDetail extends PurchaseRequestListItem {
  items: PurchaseRequestItem[];
  history: AuditLogEntry[];
}

export interface PurchaseRequestInput {
  costCenterId: string;
  notes?: string;
  items: PurchaseRequestItemInput[];
}

/// Cotação feita pelo setor de Compras: só o valor unitário de cada item, o
/// campo que saiu do formulário de quem abre a solicitação.
export interface PurchaseRequestQuoteInput {
  items: { id: string; estimatedUnitPrice: number }[];
}

export interface PurchaseRequestQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseRequestStatus;
  costCenterId?: string;
  constructionSiteId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PurchaseOrder {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  totalAmount: string;
  issueDate: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
  supplier: { id: string; legalName: string; tradeName: string | null };
  purchaseRequest: { id: string; code: string };
  constructionSite: ConstructionSiteRef | null;
  costCenter: CostCenterRef;
}

export interface PurchaseOrderInput {
  purchaseRequestId: string;
  supplierId: string;
  totalAmount: number;
  issueDate: string;
  expectedDeliveryDate?: string;
  status?: PurchaseOrderStatus;
}

export interface PurchaseOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  purchaseRequestId?: string;
}
