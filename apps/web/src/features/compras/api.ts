import { apiClient } from '@/lib/api-client';
import { downloadFile } from '@/lib/download-file';
import { toQueryString } from '@/lib/query-string';

import type {
  PaginatedResult,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderQuery,
  PurchaseRequestDetail,
  PurchaseRequestInput,
  PurchaseRequestListItem,
  PurchaseRequestQuery,
  PurchaseRequestQuoteInput,
  PurchaseRequestStatus,
  Supplier,
  SupplierInput,
  SupplierQuery,
} from './types';

export function listSuppliers(query: SupplierQuery): Promise<PaginatedResult<Supplier>> {
  return apiClient.get(`/suppliers${toQueryString(query)}`);
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return apiClient.post('/suppliers', input);
}

export function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  return apiClient.patch(`/suppliers/${id}`, input);
}

export function deleteSupplier(id: string): Promise<void> {
  return apiClient.delete(`/suppliers/${id}`);
}

export function listPurchaseRequests(
  query: PurchaseRequestQuery,
): Promise<PaginatedResult<PurchaseRequestListItem>> {
  return apiClient.get(`/purchase-requests${toQueryString(query)}`);
}

export function getPurchaseRequest(id: string): Promise<PurchaseRequestDetail> {
  return apiClient.get(`/purchase-requests/${id}`);
}

export function createPurchaseRequest(input: PurchaseRequestInput): Promise<PurchaseRequestDetail> {
  return apiClient.post('/purchase-requests', input);
}

export function updatePurchaseRequest(
  id: string,
  input: Partial<PurchaseRequestInput>,
): Promise<PurchaseRequestDetail> {
  return apiClient.patch(`/purchase-requests/${id}`, input);
}

export function updatePurchaseRequestQuote(
  id: string,
  input: PurchaseRequestQuoteInput,
): Promise<PurchaseRequestDetail> {
  return apiClient.patch(`/purchase-requests/${id}/quote`, input);
}

export function updatePurchaseRequestStatus(
  id: string,
  status: PurchaseRequestStatus,
): Promise<PurchaseRequestDetail> {
  return apiClient.patch(`/purchase-requests/${id}/status`, { status });
}

export function deletePurchaseRequest(id: string): Promise<void> {
  return apiClient.delete(`/purchase-requests/${id}`);
}

export function listPurchaseOrders(
  query: PurchaseOrderQuery,
): Promise<PaginatedResult<PurchaseOrder>> {
  return apiClient.get(`/purchase-orders${toQueryString(query)}`);
}

export function createPurchaseOrder(input: PurchaseOrderInput): Promise<PurchaseOrder> {
  return apiClient.post('/purchase-orders', input);
}

/// Baixa o PDF da solicitação. Mesmo caminho do PDF da ordem — ver a nota
/// abaixo sobre `downloadFile`.
export function downloadPurchaseRequestPdf(id: string, code: string): Promise<void> {
  return downloadFile(`/purchase-requests/${id}/pdf`, `${code}.pdf`);
}

/// Baixa o PDF da ordem. Usa o `downloadFile` que Relatórios já usa: o token
/// vai em header, então um `<a href>` simples voltaria 401.
export function downloadPurchaseOrderPdf(id: string, code: string): Promise<void> {
  return downloadFile(`/purchase-orders/${id}/pdf`, `${code}.pdf`);
}

export function deletePurchaseOrder(id: string): Promise<void> {
  return apiClient.delete(`/purchase-orders/${id}`);
}

/// Quantas solicitações estão paradas esperando alguém — alimenta o alerta da
/// Home. Os dois estados têm donos diferentes: `awaitingQuote` espera Compras
/// cotar, `awaitingApproval` espera quem autoriza.
export interface PurchaseRequestsPendingSummary {
  awaitingQuote: number;
  awaitingApproval: number;
}

export function getPurchaseRequestsPendingSummary(): Promise<PurchaseRequestsPendingSummary> {
  return apiClient.get('/purchase-requests/pending-summary');
}
