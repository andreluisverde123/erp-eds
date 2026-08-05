import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  CertificateInfo,
  IntegrationStatus,
  PaginatedResult,
  SyncResult,
  SyncRun,
  TestConnectionResult,
} from './types';

export function getIntegrationStatus(): Promise<IntegrationStatus> {
  return apiClient.get('/admin/fiscal-integration/status');
}

export function listSyncRuns(page: number, limit: number): Promise<PaginatedResult<SyncRun>> {
  return apiClient.get(`/admin/fiscal-integration/runs${toQueryString({ page, limit })}`);
}

/// Envio do certificado. Vai como multipart porque o .pfx é binário — e a
/// senha viaja no mesmo corpo, nunca em query string (que acabaria em log de
/// servidor e histórico de navegador).
export function uploadCertificate(file: File, password: string): Promise<CertificateInfo> {
  const form = new FormData();
  form.append('file', file);
  form.append('password', password);
  // `upload` e não `post`: o `post` faz JSON.stringify no corpo, o que
  // transformaria o FormData em "[object FormData]".
  return apiClient.upload('/admin/fiscal-integration/certificate', form);
}

export function removeCertificate(): Promise<void> {
  return apiClient.delete('/admin/fiscal-integration/certificate');
}

export function testConnection(): Promise<TestConnectionResult> {
  return apiClient.post('/admin/fiscal-integration/test-connection');
}

export function syncNow(): Promise<SyncResult> {
  return apiClient.post('/admin/fiscal-integration/sync');
}
