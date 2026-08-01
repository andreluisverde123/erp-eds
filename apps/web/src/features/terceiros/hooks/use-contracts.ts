import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listContracts } from '../api';
import type { ContractQuery } from '../types';

export function useContracts(query: ContractQuery) {
  return useQuery({
    queryKey: ['contracts', 'list', query],
    queryFn: () => listContracts(query),
    placeholderData: keepPreviousData,
  });
}
