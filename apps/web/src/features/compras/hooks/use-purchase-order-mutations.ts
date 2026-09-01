import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cancelPurchaseOrder, createPurchaseOrder, deletePurchaseOrder } from '../api';
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

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelPurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      // A solicitação de origem mostra a situação da compra: cancelar a ordem
      // muda o que ela exibe.
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
