import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cancelInboundInvoice, createInboundInvoice, reconcileInboundInvoice } from '../api';
import type { InboundInvoiceInput, ReconcileInput } from '../types';

/// A conciliação cria uma Invoice e parcelas de contas a pagar, então invalida
/// também as telas do financeiro: sem isso, Contas a Pagar continuaria por até
/// 30s (staleTime) sem os vencimentos que acabaram de nascer.
function invalidateAfterReconcile(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['inbound-invoices'] });
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  queryClient.invalidateQueries({ queryKey: ['account-payables'] });
}

export function useCreateInboundInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InboundInvoiceInput) => createInboundInvoice(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbound-invoices'] }),
  });
}

export function useReconcileInboundInvoice(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReconcileInput) => reconcileInboundInvoice(id, input),
    onSuccess: () => invalidateAfterReconcile(queryClient),
  });
}

export function useCancelInboundInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelInboundInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbound-invoices'] }),
  });
}
