import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listAccountPayables } from '../api';
import type { AccountPayableQuery } from '../types';

export function useAccountPayables(query: AccountPayableQuery) {
  return useQuery({
    queryKey: ['account-payables', 'list', query],
    queryFn: () => listAccountPayables(query),
    placeholderData: keepPreviousData,
  });
}
