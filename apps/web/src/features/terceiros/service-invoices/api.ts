import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type { PaginatedResult } from '../types';
import type {
  ServiceInvoice,
  ServiceInvoiceCostCenter,
  ServiceInvoiceFile,
  ServiceInvoiceInput,
  ServiceInvoiceQuery,
} from './types';

export function listServiceInvoices(
  query: ServiceInvoiceQuery,
): Promise<PaginatedResult<ServiceInvoice>> {
  return apiClient.get(`/service-invoices${toQueryString(query)}`);
}

export function listServiceInvoiceCostCenters(): Promise<ServiceInvoiceCostCenter[]> {
  return apiClient.get('/service-invoices/cost-centers');
}

export function createServiceInvoice(input: ServiceInvoiceInput): Promise<ServiceInvoice> {
  return apiClient.post('/service-invoices', input);
}

export function cancelServiceInvoice(id: string): Promise<ServiceInvoice> {
  return apiClient.delete(`/service-invoices/${id}`);
}

export function listServiceInvoiceFiles(id: string): Promise<ServiceInvoiceFile[]> {
  return apiClient.get(`/service-invoices/${id}/files`);
}

export function uploadServiceInvoiceFile(id: string, file: File): Promise<ServiceInvoiceFile> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post(`/service-invoices/${id}/files`, formData);
}
