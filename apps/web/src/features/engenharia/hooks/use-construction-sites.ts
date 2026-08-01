import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listConstructionSites } from '../api';
import type { ConstructionSiteQuery } from '../types';

export function useConstructionSites(query: ConstructionSiteQuery) {
  return useQuery({
    queryKey: ['construction-sites', 'list', query],
    queryFn: () => listConstructionSites(query),
    placeholderData: keepPreviousData,
  });
}
