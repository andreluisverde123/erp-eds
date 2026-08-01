import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listContractors } from '../api';
import type { ContractorQuery } from '../types';

export function useContractors(query: ContractorQuery) {
  return useQuery({
    queryKey: ['contractors', 'list', query],
    queryFn: () => listContractors(query),
    placeholderData: keepPreviousData,
  });
}
