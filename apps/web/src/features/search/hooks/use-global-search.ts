import { useQuery } from '@tanstack/react-query';

import { globalSearch } from '../api';

const MIN_QUERY_LENGTH = 2;

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ['global-search', query],
    queryFn: () => globalSearch(query),
    enabled: query.trim().length >= MIN_QUERY_LENGTH,
  });
}
