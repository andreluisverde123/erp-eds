import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  CatalogOption,
  Composition,
  CompositionInput,
  CompositionItemInput,
  CompositionItemUpdate,
  CompositionQuery,
  CompositionSummary,
  PaginatedResult,
} from './types';

export function listCompositions(
  query: CompositionQuery,
): Promise<PaginatedResult<CompositionSummary>> {
  return apiClient.get(`/compositions${toQueryString(query)}`);
}

export function getComposition(id: string): Promise<Composition> {
  return apiClient.get(`/compositions/${id}`);
}

export function createComposition(input: CompositionInput): Promise<Composition> {
  return apiClient.post('/compositions', input);
}

export function updateComposition(
  id: string,
  input: Partial<CompositionInput>,
): Promise<Composition> {
  return apiClient.patch(`/compositions/${id}`, input);
}

export function deleteComposition(id: string): Promise<void> {
  return apiClient.delete(`/compositions/${id}`);
}

/// Insumos ATIVOS que podem entrar na composição. A rota mora em
/// `/compositions`, e não em `/catalog-items`, porque serve este editor e exige
/// a permissão dele — não a de consultar o catálogo.
export function searchCompositionCatalogOptions(search: string): Promise<CatalogOption[]> {
  return apiClient.get(`/compositions/catalog-options${toQueryString({ search })}`);
}

/// As três rotas de item devolvem a composição inteira, já recalculada.
export function addCompositionItem(
  compositionId: string,
  input: CompositionItemInput,
): Promise<Composition> {
  return apiClient.post(`/compositions/${compositionId}/items`, input);
}

export function updateCompositionItem(
  compositionId: string,
  itemId: string,
  input: CompositionItemUpdate,
): Promise<Composition> {
  return apiClient.patch(`/compositions/${compositionId}/items/${itemId}`, input);
}

export function removeCompositionItem(
  compositionId: string,
  itemId: string,
): Promise<Composition | undefined> {
  return apiClient.delete(`/compositions/${compositionId}/items/${itemId}`);
}
