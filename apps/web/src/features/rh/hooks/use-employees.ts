import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listEmployeePositions, listEmployees } from '../api';
import type { EmployeeQuery } from '../types';

export function useEmployees(query: EmployeeQuery) {
  return useQuery({
    queryKey: ['employees', 'list', query],
    queryFn: () => listEmployees(query),
    placeholderData: keepPreviousData,
  });
}

export function useEmployeePositions() {
  return useQuery({
    queryKey: ['employees', 'positions'],
    queryFn: () => listEmployeePositions(),
  });
}
