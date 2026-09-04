import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addPurchaseRequestItems,
  createPurchaseRequest,
  deletePurchaseRequest,
  downloadPurchaseRequestPdf,
  updatePurchaseRequest,
  updatePurchaseRequestQuote,
  updatePurchaseRequestStatus,
} from '../api';
import type {
  PurchaseRequestItemInput,
  PurchaseRequestInput,
  PurchaseRequestQuoteInput,
  PurchaseRequestStatus,
} from '../types';

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseRequestInput) => createPurchaseRequest(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<PurchaseRequestInput>) => updatePurchaseRequest(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useAddPurchaseRequestItems(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: PurchaseRequestItemInput[]) => addPurchaseRequestItems(id, items),
    onSuccess: () => {
      // A listagem também muda: o total estimado e a contagem de itens saem
      // dela, e uma solicitação com item novo não pode continuar mostrando os
      // números de antes.
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}

export function useUpdatePurchaseRequestQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseRequestQuoteInput) => updatePurchaseRequestQuote(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useUpdatePurchaseRequestStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: PurchaseRequestStatus) => updatePurchaseRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

/// Gerar o PDF é uma MUTATION mesmo sem escrever nada no servidor: o que se
/// quer daqui é `isPending` e `error`, para a tela dizer "Gerando PDF..." e
/// mostrar o que houve se falhar. Uma query cacheada devolveria o mesmo
/// arquivo sem gerar de novo, que não é o comportamento de um botão.
///
/// NÃO invalida nada: imprimir não muda o estado da solicitação.
export function useDownloadPurchaseRequestPdf() {
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      downloadPurchaseRequestPdf(id, code),
  });
}

export function useDeletePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePurchaseRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}
