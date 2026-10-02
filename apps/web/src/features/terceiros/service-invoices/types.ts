import type { Attachment } from '@/features/anexos/api';

/// Situação da nota do ponto de vista de quem a lançou. Derivada pela API.
export type ServiceInvoiceSituation =
  'AGUARDANDO_LIBERACAO' | 'LIBERADA' | 'PAGA_PARCIAL' | 'PAGA' | 'CANCELADA';

export const SITUATION_LABEL: Record<ServiceInvoiceSituation, string> = {
  AGUARDANDO_LIBERACAO: 'Aguardando liberação',
  LIBERADA: 'Liberada para pagamento',
  PAGA_PARCIAL: 'Paga em parte',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export interface ServiceInvoice {
  id: string;
  documentNumber: string | null;
  description: string | null;
  notes: string | null;
  amount: string;
  issueDate: string | null;
  dueDate: string;
  createdAt: string;
  situation: ServiceInvoiceSituation;
  approvedForPaymentAt: string | null;
  approvedForPaymentBy: { id: string; name: string } | null;
  launchedBy: { id: string; name: string } | null;
  contractor: { id: string; legalName: string; tradeName: string | null; document: string };
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
  attachmentsCount: number;
}

export interface ServiceInvoiceInput {
  contractorId: string;
  /// Um dos dois: centro de custo, ou a obra que ainda não tem centro de custo.
  costCenterId?: string;
  constructionSiteId?: string;
  documentNumber: string;
  description: string;
  amount: number;
  dueDate: string;
  issueDate?: string;
  notes?: string;
}

export interface ServiceInvoiceQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractorId?: string;
  situation?: ServiceInvoiceSituation;
}

/// Onde a nota pode entrar: obra com centro de custo, obra sozinha (sem centro
/// de custo cadastrado) ou centro administrativo (sem obra).
export interface ServiceInvoiceDestination {
  constructionSite: { id: string; code: string; name: string } | null;
  costCenter: { id: string; code: string; name: string } | null;
}

export type ServiceInvoiceFile = Attachment;
