import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchaseRequests } from '../api';
import type { PurchaseRequestQuery } from '../types';

export function usePurchaseRequests(query: PurchaseRequestQuery) {
  return useQuery({
    queryKey: ['purchase-requests', 'list', query],
    queryFn: () => listPurchaseRequests(query),
    placeholderData: keepPreviousData,
  });
}
