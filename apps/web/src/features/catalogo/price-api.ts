import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  CatalogItemPrice,
  CatalogItemPriceAt,
  ManualPriceInput,
  PurchasePriceCandidate,
} from './price-types';
import type { PaginatedResult } from './types';

const base = (catalogItemId: string) => `/catalog-items/${catalogItemId}/prices`;

export function listCatalogItemPrices(
  catalogItemId: string,
  query: { page: number; limit: number },
): Promise<PaginatedResult<CatalogItemPrice>> {
  return apiClient.get(`${base(catalogItemId)}${toQueryString(query)}`);
}

/// O preço vigente numa data (`AAAA-MM-DD`). Sem data, hoje.
export function getCatalogItemPriceAt(
  catalogItemId: string,
  date?: string,
): Promise<CatalogItemPriceAt> {
  return apiClient.get(`${base(catalogItemId)}/at${toQueryString({ date })}`);
}

export function registerManualPrice(
  catalogItemId: string,
  input: ManualPriceInput,
): Promise<CatalogItemPrice> {
  return apiClient.post(base(catalogItemId), input);
}

export function listPurchasePriceCandidates(
  catalogItemId: string,
): Promise<PurchasePriceCandidate[]> {
  return apiClient.get(`${base(catalogItemId)}/purchase-candidates`);
}

export function registerPurchasePrice(
  catalogItemId: string,
  purchaseOrderItemId: string,
): Promise<CatalogItemPrice> {
  return apiClient.post(`${base(catalogItemId)}/from-purchase`, { purchaseOrderItemId });
}
