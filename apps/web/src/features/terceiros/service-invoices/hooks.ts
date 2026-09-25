import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelServiceInvoice,
  createServiceInvoice,
  listServiceInvoiceCostCenters,
  listServiceInvoiceFiles,
  listServiceInvoices,
  uploadServiceInvoiceFile,
} from './api';
import type { ServiceInvoiceInput, ServiceInvoiceQuery } from './types';

const KEY = 'service-invoices';

export function useServiceInvoices(query: ServiceInvoiceQuery) {
  return useQuery({
    queryKey: [KEY, 'list', query],
    queryFn: () => listServiceInvoices(query),
    placeholderData: keepPreviousData,
  });
}

export function useServiceInvoiceCostCenters() {
  return useQuery({
    queryKey: [KEY, 'cost-centers'],
    queryFn: listServiceInvoiceCostCenters,
    staleTime: 60_000,
  });
}

export function useServiceInvoiceFiles(id: string | null) {
  return useQuery({
    queryKey: [KEY, 'files', id],
    queryFn: () => listServiceInvoiceFiles(id!),
    enabled: id !== null,
  });
}

/// Lança a nota e, se veio arquivo, sobe em seguida. Duas chamadas: a conta
/// precisa existir para o anexo ter onde morar.
export function useCreateServiceInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, file }: { input: ServiceInvoiceInput; file: File | null }) => {
      const nota = await createServiceInvoice(input);
      if (file) {
        try {
          await uploadServiceInvoiceFile(nota.id, file);
        } catch {
          // A nota já está lançada: não desfazer por causa do arquivo. A tela
          // avisa e o arquivo pode ser enviado de novo pela linha da nota.
          return { nota, fileFailed: true };
        }
      }
      return { nota, fileFailed: false };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUploadServiceInvoiceFile(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadServiceInvoiceFile(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCancelServiceInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelServiceInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
