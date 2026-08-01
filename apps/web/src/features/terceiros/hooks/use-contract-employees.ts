import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listContractEmployees } from '../api';
import type { ContractEmployeeQuery } from '../types';

export function useContractEmployees(query: ContractEmployeeQuery) {
  return useQuery({
    queryKey: ['contract-employees', 'list', query],
    queryFn: () => listContractEmployees(query),
    placeholderData: keepPreviousData,
  });
}
