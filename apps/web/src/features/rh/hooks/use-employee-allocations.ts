import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listEmployeeAllocations } from '../api';
import type { EmployeeAllocationQuery } from '../types';

export function useEmployeeAllocations(query: EmployeeAllocationQuery) {
  return useQuery({
    queryKey: ['employee-allocations', 'list', query],
    queryFn: () => listEmployeeAllocations(query),
    placeholderData: keepPreviousData,
  });
}
