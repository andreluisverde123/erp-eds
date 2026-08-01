import { apiClient } from '@/lib/api-client';
import { downloadFile } from '@/lib/download-file';
import { toQueryString } from '@/lib/query-string';

import type {
  ComprasIndicators,
  EngenhariaIndicators,
  ExecutiveSummary,
  FinanceiroIndicators,
  PaginatedResult,
  ReportQuery,
  ReportType,
  RhIndicators,
  TerceirosIndicators,
} from './types';

export function getExecutiveSummary(): Promise<ExecutiveSummary> {
  return apiClient.get('/relatorios/dashboard/summary');
}

export function getComprasIndicators(): Promise<ComprasIndicators> {
  return apiClient.get('/relatorios/indicators/compras');
}

export function getFinanceiroIndicators(): Promise<FinanceiroIndicators> {
  return apiClient.get('/relatorios/indicators/financeiro');
}

export function getEngenhariaIndicators(): Promise<EngenhariaIndicators> {
  return apiClient.get('/relatorios/indicators/engenharia');
}

export function getRhIndicators(): Promise<RhIndicators> {
  return apiClient.get('/relatorios/indicators/rh');
}

export function getTerceirosIndicators(): Promise<TerceirosIndicators> {
  return apiClient.get('/relatorios/indicators/terceiros');
}

export function getReport<T>(type: ReportType, query: ReportQuery): Promise<PaginatedResult<T>> {
  return apiClient.get(`/relatorios/reports/${type}${toQueryString(query)}`);
}

const EXPORT_MIME: Record<'xlsx' | 'pdf', string> = {
  xlsx: 'xlsx',
  pdf: 'pdf',
};

export async function downloadReportExport(
  type: ReportType,
  query: ReportQuery,
  format: 'xlsx' | 'pdf',
): Promise<void> {
  await downloadFile(
    `/relatorios/reports/${type}/export${toQueryString({ ...query, format })}`,
    `relatorio-${type}.${EXPORT_MIME[format]}`,
  );
}
