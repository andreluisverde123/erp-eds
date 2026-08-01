import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPayments } from '../api';
import type { PaymentQuery } from '../types';

export function usePayments(query: PaymentQuery) {
  return useQuery({
    queryKey: ['payments', 'list', query],
    queryFn: () => listPayments(query),
    placeholderData: keepPreviousData,
  });
}
