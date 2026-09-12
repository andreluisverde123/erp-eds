import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemQuery,
  MeasurementUnit,
  PaginatedResult,
} from './types';

export function listCatalogItems(query: CatalogItemQuery): Promise<PaginatedResult<CatalogItem>> {
  return apiClient.get(`/catalog-items${toQueryString(query)}`);
}

export function listMeasurementUnits(): Promise<MeasurementUnit[]> {
  return apiClient.get('/catalog-items/units');
}

export function listCatalogCategories(): Promise<string[]> {
  return apiClient.get('/catalog-items/categories');
}

export function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  return apiClient.post('/catalog-items', input);
}

export function updateCatalogItem(
  id: string,
  input: Partial<CatalogItemInput>,
): Promise<CatalogItem> {
  return apiClient.patch(`/catalog-items/${id}`, input);
}

export function deleteCatalogItem(id: string): Promise<void> {
  return apiClient.delete(`/catalog-items/${id}`);
}
