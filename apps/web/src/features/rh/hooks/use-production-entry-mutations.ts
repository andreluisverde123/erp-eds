import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createProductionEntry, deleteProductionEntry } from '../api';
import type { ProductionEntryInput } from '../types';

export function useCreateProductionEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProductionEntryInput) => createProductionEntry(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['production-entries'] }),
  });
}

export function useDeleteProductionEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProductionEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['production-entries'] }),
  });
}
