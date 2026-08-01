import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listSuppliers } from '../api';
import type { SupplierQuery } from '../types';

export function useSuppliers(query: SupplierQuery) {
  return useQuery({
    queryKey: ['suppliers', 'list', query],
    queryFn: () => listSuppliers(query),
    placeholderData: keepPreviousData,
  });
}
