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

/// Como um desconto foi INFORMADO. O valor em reais é sempre derivado da base
/// a que ele se aplica; guardar o tipo preserva a intenção de quem digitou.
export type DiscountType = 'AMOUNT' | 'PERCENT';

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
  /// Observação de QUEM PEDIU. Não confundir com `unavailabilityNote`, que é
  /// de Compras.
  notes: string | null;
  /// Compras procurou e o fornecedor não tem. Item assim fica sem preço e
  /// fora do `estimatedTotal` — não é "R$ 0,00", é ausência.
  unavailable: boolean;
  /// Por que não tem ("sem estoque"). Opcional, e só existe junto de
  /// `unavailable`.
  unavailabilityNote: string | null;
  /// Desconto DESTA linha, sobre `quantidade × preço unitário`. `AMOUNT` com
  /// valor `"0"` é a ausência de desconto.
  discountType: DiscountType;
  discountValue: string;
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
  /// O TOTAL FINAL, depois do desconto de item e do desconto geral. É o número
  /// que a alçada de aprovação usa.
  estimatedTotal: number;
  /// Desconto GERAL da cotação, sobre o subtotal já líquido dos descontos de
  /// item.
  discountType: DiscountType;
  discountValue: string;
  /// A conta aberta em etapas, calculada pelo servidor. A tela recalcula
  /// enquanto o usuário digita (ver `quote-totals.ts`), mas o que ela EXIBE
  /// depois de salvar é isto.
  totals: PurchaseRequestTotals;
}

export interface PurchaseRequestTotals {
  itemsSubtotal: number;
  itemsDiscount: number;
  subtotalAfterItemDiscounts: number;
  generalDiscount: number;
  total: number;
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

/// Cotação feita pelo setor de Compras: valor unitário e disponibilidade de
/// cada item — os dois campos que a cotação decide, e que não estão no
/// formulário de quem abre a solicitação.
///
/// `estimatedUnitPrice` é opcional porque o fornecedor pode não ter o item.
/// Ver `UpdatePurchaseRequestQuoteDto` na API para os três estados possíveis.
export interface PurchaseRequestQuoteInput {
  items: {
    id: string;
    estimatedUnitPrice?: number;
    unavailable?: boolean;
    unavailabilityNote?: string;
    /// Ausente é o mesmo que zero — e é o que apaga um desconto informado
    /// antes.
    discount?: DiscountInput;
  }[];
  /// Desconto GERAL, sobre o subtotal já líquido dos descontos de item.
  discount?: DiscountInput;
}

export interface DiscountInput {
  type: DiscountType;
  value: number;
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
  /// Desconto DESTA linha, copiado da cotação ao gerar a ordem.
  discountType: DiscountType;
  discountValue: string;
  /// `quantidade × preço − desconto da linha`.
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
  /// Desconto GERAL da ordem, sobre o subtotal já líquido dos descontos de
  /// item. Copiado da solicitação ao gerar.
  discountType: DiscountType;
  discountValue: string;
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
  /// Ausente significa SEM desconto — a ordem não consulta a cotação para
  /// preencher lacuna; quem copia o valor é a tela, ao montar o formulário.
  discount?: DiscountInput;
  notes?: string;
}

export interface PurchaseOrderInput {
  purchaseRequestId: string;
  supplierId: string;
  /// A atribuição de custo da ordem. A solicitação pode ter vindo sem uma, e é
  /// na emissão que ela deixa de ser opcional.
  costCenterId: string;
  /// Desconto geral, copiado da cotação pela tela e editável antes de gerar.
  discount?: DiscountInput;
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
