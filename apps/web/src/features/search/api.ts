import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type { SearchResults } from './types';

export function globalSearch(q: string): Promise<SearchResults> {
  return apiClient.get(`/search${toQueryString({ q })}`);
}
