import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listProductionEntries } from '../api';
import type { ProductionEntryQuery } from '../types';

export function useProductionEntries(query: ProductionEntryQuery) {
  return useQuery({
    queryKey: ['production-entries', 'list', query],
    queryFn: () => listProductionEntries(query),
    placeholderData: keepPreviousData,
  });
}
