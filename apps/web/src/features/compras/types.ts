export type PurchaseRequestStatus = 'DRAFT' | 'PENDING' | 'QUOTING' | 'APPROVED' | 'CANCELLED';
export type PurchaseOrderStatus = 'OPEN' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/// `origin` diz quem cadastrou: `MANUAL` alguém digitou, `NFE` o importador
/// fiscal criou sozinho a partir do emitente de uma nota. A tela precisa
/// distinguir os dois — um cadastro automático nascido de um resumo tem só
/// razão social, CNPJ e IE, e ninguém conferiu nada ali.
export type SupplierOrigin = 'MANUAL' | 'NFE';

export interface Supplier {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  stateRegistration: string | null;
  address: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  origin: SupplierOrigin;
  /// Chave de acesso da nota que originou o cadastro automático. Nula em
  /// cadastro manual.
  originAccessKey: string | null;
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
  /// Escolhida no formulário e obrigatória — voltou a ser o destino da
  /// solicitação.
  constructionSite: ConstructionSiteRef;
  /// Nulo quando o solicitante não soube informar. Compras preenche na emissão
  /// da Ordem de Compra, onde ele volta a ser obrigatório.
  costCenter: CostCenterRef | null;
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
  constructionSiteId: string;
  /// `null` limpa a atribuição na edição de um rascunho; omitir manteria a
  /// que já está gravada.
  costCenterId: string | null;
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

/// Uma linha da ordem de compra, com a linha da solicitação que a originou
/// viajando junto — é o que permite a tela mostrar a origem sem uma segunda
/// requisição.
///
/// Decimais chegam como string no JSON (ver a nota em `PurchaseRequestItem`).
export interface PurchaseOrderItem {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  notes: string | null;
  purchaseRequestItem: {
    id: string;
    description: string;
    /// A quantidade SOLICITADA — pode diferir da comprada (compra parcial).
    quantity: string;
    unit: string;
    estimatedUnitPrice: string | null;
    purchaseRequest: { id: string; code: string };
  };
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
  /// Vazio nas ordens emitidas ANTES da criação desta estrutura — elas
  /// continuam válidas, apenas sem detalhamento por item.
  items: PurchaseOrderItem[];
  /// Em que ponto do financeiro esta compra está. DERIVADO pela API do que os
  /// módulos do financeiro já gravam — não existe status financeiro guardado
  /// na ordem, e Compras não escreve nada disso.
  financialStatus: PurchaseOrderFinancialStatus;
}

/// Os cinco pontos do caminho, na ordem em que acontecem.
export type PurchaseOrderFinancialStage =
  'WITHOUT_INVOICE' | 'INVOICE_RECEIVED' | 'RECONCILED' | 'PAYABLE_CREATED' | 'PAID';

export interface PurchaseOrderFinancialStatus {
  stage: PurchaseOrderFinancialStage;
  hasInboundInvoice: boolean;
  isReconciled: boolean;
  hasPayable: boolean;
  isFullyPaid: boolean;
  payables: { total: number; open: number; paid: number; cancelled: number };
  invoices: { id: string; number: string; series: string | null; status: string }[];
  inboundInvoices: {
    id: string;
    number: string;
    series: string | null;
    status: string;
    reconciled: boolean;
  }[];
}

/// Uma linha enviada ao criar a ordem. Só o que o comprador decide:
/// `description` e `unit` o backend copia da origem, e `totalPrice` ele
/// calcula.
export interface PurchaseOrderItemInput {
  purchaseRequestItemId: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface PurchaseOrderInput {
  purchaseRequestId: string;
  supplierId: string;
  /// A atribuição de custo da ordem. A solicitação pode ter vindo sem uma, e é
  /// na emissão que ela deixa de ser opcional.
  costCenterId: string;
  /// Sem `totalAmount`: o total da ordem é a soma dos itens, calculada pelo
  /// backend. A tela mostra a soma enquanto o usuário digita, mas o número
  /// que vale é o que volta do servidor.
  issueDate: string;
  expectedDeliveryDate?: string;
  status?: PurchaseOrderStatus;
  items: PurchaseOrderItemInput[];
}

export interface PurchaseOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  purchaseRequestId?: string;
}
