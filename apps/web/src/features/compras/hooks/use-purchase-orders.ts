import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchaseOrders } from '../api';
import type { PurchaseOrderQuery } from '../types';

export function usePurchaseOrders(query: PurchaseOrderQuery) {
  return useQuery({
    queryKey: ['purchase-orders', 'list', query],
    queryFn: () => listPurchaseOrders(query),
    placeholderData: keepPreviousData,
  });
}
