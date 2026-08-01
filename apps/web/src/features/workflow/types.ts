export type ComprasStage =
  'SOLICITACAO' | 'COTACAO' | 'APROVACAO' | 'ORDEM' | 'RECEBIMENTO' | 'FINANCEIRO' | 'CANCELADO';
export type FinanceiroStage =
  'NOTA' | 'CONFERENCIA_APROVACAO' | 'PAGAMENTO' | 'BAIXA' | 'CANCELADO';
export type RhStage = 'CADASTRO' | 'ALOCACAO' | 'PRODUCAO' | 'DESLIGAMENTO';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface TimelineEntry {
  id: string;
  entityType: string;
  action: string;
  changes: unknown;
  createdAt: string;
  actor: { id: string; name: string } | null;
  synthetic: boolean;
}

export interface WorkflowComment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface WorkflowAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export interface ComprasPipelineListRow {
  id: string;
  code: string;
  stage: ComprasStage;
  requestedBy: { id: string; name: string };
  costCenter: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface ComprasPipelineDetail extends ComprasPipelineListRow {
  status: string;
  purchaseOrders: {
    id: string;
    code: string;
    status: string;
    updatedAt: string;
    invoices: { id: string; number: string; status: string; updatedAt: string }[];
  }[];
  timeline: TimelineEntry[];
}

export interface FinanceiroPipelineListRow {
  id: string;
  number: string;
  series: string | null;
  stage: FinanceiroStage;
  supplier: { id: string; legalName: string; tradeName: string | null };
  responsavel: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceiroPipelineDetail extends FinanceiroPipelineListRow {
  status: string;
  responsavelOrigin?: string;
  accountsPayable: {
    id: string;
    status: string;
    amount: string;
    dueDate: string;
    updatedAt: string;
    payments: { id: string; amount: string; status: string; paidAt: string }[];
  }[];
  timeline: TimelineEntry[];
}

export interface RhPipelineListRow {
  id: string;
  name: string;
  position: string;
  stage: RhStage;
  responsavel: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RhPipelineDetail extends RhPipelineListRow {
  status: string;
  terminationDate: string | null;
  hasAllocation: boolean;
  hasProduction: boolean;
  timeline: TimelineEntry[];
}

export type WorkflowEntityType =
  'PurchaseRequest' | 'PurchaseOrder' | 'Invoice' | 'AccountPayable' | 'Employee';
