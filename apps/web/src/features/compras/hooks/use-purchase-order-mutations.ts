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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      // Excluir a ordem DEVOLVE o saldo dela à solicitação — os itens voltam a
      // ser compráveis. Sem esta invalidação a tela continuaria mostrando o
      // pendente antigo até alguém recarregar, e o botão de nova ordem seguiria
      // escondido numa solicitação que voltou a ter o que comprar.
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}
