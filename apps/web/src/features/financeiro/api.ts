import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  AccountPayable,
  AccountPayableDetail,
  AccountPayableQuery,
  AccountPayableSummary,
  Invoice,
  InvoiceInput,
  InvoiceQuery,
  InvoiceStatus,
  PaginatedResult,
  Payment,
  PaymentInput,
  PaymentQuery,
} from './types';

export function listInvoices(query: InvoiceQuery): Promise<PaginatedResult<Invoice>> {
  return apiClient.get(`/invoices${toQueryString(query)}`);
}

export function createInvoice(input: InvoiceInput): Promise<Invoice> {
  return apiClient.post('/invoices', input);
}

export function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  return apiClient.patch(`/invoices/${id}/status`, { status });
}

export function deleteInvoice(id: string): Promise<void> {
  return apiClient.delete(`/invoices/${id}`);
}

export function listAccountPayables(
  query: AccountPayableQuery,
): Promise<PaginatedResult<AccountPayable>> {
  return apiClient.get(`/account-payables${toQueryString(query)}`);
}

export function getAccountPayable(id: string): Promise<AccountPayableDetail> {
  return apiClient.get(`/account-payables/${id}`);
}

export function getAccountPayableSummary(): Promise<AccountPayableSummary> {
  return apiClient.get('/account-payables/summary');
}

export function listPayments(query: PaymentQuery): Promise<PaginatedResult<Payment>> {
  return apiClient.get(`/payments${toQueryString(query)}`);
}

export function createPayment(input: PaymentInput): Promise<Payment> {
  return apiClient.post('/payments', input);
}
