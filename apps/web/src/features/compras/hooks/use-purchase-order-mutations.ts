import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createPurchaseOrder, deletePurchaseOrder } from '../api';
import type { PurchaseOrderInput } from '../types';

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseOrderInput) => createPurchaseOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      // A solicitação de origem passa a ter uma ordem vinculada.
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePurchaseOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}
