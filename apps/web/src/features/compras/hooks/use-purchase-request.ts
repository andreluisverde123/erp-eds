import { useQuery } from '@tanstack/react-query';

import { getPurchaseRequest } from '../api';

export function usePurchaseRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-requests', 'detail', id],
    queryFn: () => getPurchaseRequest(id!),
    enabled: Boolean(id),
  });
}
