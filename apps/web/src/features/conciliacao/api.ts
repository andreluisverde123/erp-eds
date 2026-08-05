import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  InboundInvoice,
  InboundInvoiceDetail,
  InboundInvoiceInput,
  InboundInvoiceQuery,
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
