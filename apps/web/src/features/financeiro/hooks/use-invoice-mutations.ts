import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createInvoice, deleteInvoice, updateInvoiceStatus } from '../api';
import type { InvoiceInput, InvoiceStatus } from '../types';

/// Validar uma nota gera uma conta a pagar automaticamente — as duas árvores
/// de query precisam ser invalidadas juntas.
function invalidateFinanceiro(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  queryClient.invalidateQueries({ queryKey: ['account-payables'] });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InvoiceInput) => createInvoice(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useUpdateInvoiceStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: InvoiceStatus) => updateInvoiceStatus(id, status),
    onSuccess: () => invalidateFinanceiro(queryClient),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });
}
