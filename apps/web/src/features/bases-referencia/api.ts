import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  PaginatedResult,
  ReferenceCompositionDetail,
  ReferenceCompositionRow,
  ReferenceDataset,
  ReferenceDatasetPreview,
  ReferenceDatasetQuery,
  ReferenceImportInput,
  ReferenceItemRow,
  ReferenceSearchQuery,
} from './types';

export function listReferenceDatasets(query: ReferenceDatasetQuery): Promise<PaginatedResult<ReferenceDataset>> {
  return apiClient.get(`/reference-datasets${toQueryString(query)}`);
}

export function getReferenceDataset(id: string): Promise<ReferenceDataset> {
  return apiClient.get(`/reference-datasets/${id}`);
}

export function searchReferenceItems(id: string, query: ReferenceSearchQuery): Promise<PaginatedResult<ReferenceItemRow>> {
  return apiClient.get(`/reference-datasets/${id}/items${toQueryString(query)}`);
}

export function searchReferenceCompositions(
  id: string,
  query: ReferenceSearchQuery,
): Promise<PaginatedResult<ReferenceCompositionRow>> {
  return apiClient.get(`/reference-datasets/${id}/compositions${toQueryString(query)}`);
}

export function getReferenceComposition(compositionId: string): Promise<ReferenceCompositionDetail> {
  return apiClient.get(`/reference-datasets/compositions/${compositionId}`);
}

function formulario(input: ReferenceImportInput, fileHash?: string): FormData {
  const dados = new FormData();
  dados.append('source', input.source);
  if (input.uf) dados.append('uf', input.uf);
  if (input.regime) dados.append('regime', input.regime);
  if (input.versionLabel?.trim()) dados.append('versionLabel', input.versionLabel.trim());
  if (fileHash) dados.append('fileHash', fileHash);
  for (const arquivo of input.files) dados.append('files', arquivo);
  return dados;
}

/// Lê e valida os arquivos. Não grava nada.
export function previewReferenceDataset(input: ReferenceImportInput): Promise<ReferenceDatasetPreview> {
  return apiClient.upload('/reference-datasets/preview', formulario(input));
}

/// Confirma a prévia: os MESMOS arquivos, conferidos pelo hash.
export function importReferenceDataset(input: ReferenceImportInput, fileHash: string): Promise<ReferenceDataset> {
  return apiClient.upload('/reference-datasets/import', formulario(input, fileHash));
}
