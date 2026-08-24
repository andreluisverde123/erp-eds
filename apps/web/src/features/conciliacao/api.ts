import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  CompatibilityReport,
  CostCenterOption,
  InboundInvoice,
  InboundInvoiceDetail,
  InboundInvoiceInput,
  InboundInvoiceQuery,
  OpenPurchaseOrder,
  PaginatedResult,
  PurchaseOrderSuggestion,
  ReconcileInput,
} from './types';

export function listInboundInvoices(
  query: InboundInvoiceQuery,
): Promise<PaginatedResult<InboundInvoice>> {
  return apiClient.get(`/inbound-invoices${toQueryString(query)}`);
}

export function getInboundInvoice(id: string): Promise<InboundInvoiceDetail> {
  return apiClient.get(`/inbound-invoices/${id}`);
}

/// Ordens de compra compatíveis, já ordenadas da mais provável para a menos.
export function getPurchaseOrderSuggestions(id: string): Promise<PurchaseOrderSuggestion[]> {
  return apiClient.get(`/inbound-invoices/${id}/suggestions`);
}

/// Comparação com uma ordem escolhida à mão — a que não veio nas sugestões.
/// Sugerir e comparar são coisas diferentes: o sistema só sugere ordem do
/// mesmo emitente, mas o usuário pode escolher qualquer uma.
export function compareWithOrder(
  id: string,
  purchaseOrderId: string,
): Promise<CompatibilityReport> {
  return apiClient.get(`/inbound-invoices/${id}/compare/${purchaseOrderId}`);
}

/// Todas as ordens em aberto, sem filtro de fornecedor — para quando o
/// sistema não tem sugestão a dar mas o usuário sabe qual é a ordem.
export function listOpenPurchaseOrders(search?: string): Promise<OpenPurchaseOrder[]> {
  return apiClient.get(`/inbound-invoices/options/purchase-orders${toQueryString({ search })}`);
}

/// Centros de custo, para o lançamento sem ordem de compra.
export function listCostCenters(): Promise<CostCenterOption[]> {
  return apiClient.get('/inbound-invoices/options/cost-centers');
}

/// Entrada manual. Enquanto não existir captura automática de XML, é por aqui
/// que toda nota entra no sistema.
export function createInboundInvoice(input: InboundInvoiceInput): Promise<InboundInvoiceDetail> {
  return apiClient.post('/inbound-invoices', input);
}

export function reconcileInboundInvoice(
  id: string,
  input: ReconcileInput,
): Promise<InboundInvoiceDetail> {
  return apiClient.post(`/inbound-invoices/${id}/reconcile`, input);
}

export function cancelInboundInvoice(id: string): Promise<InboundInvoiceDetail> {
  return apiClient.post(`/inbound-invoices/${id}/cancel`);
}
