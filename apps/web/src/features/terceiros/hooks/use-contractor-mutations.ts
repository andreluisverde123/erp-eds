import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createContractor, deleteContractor, updateContractor } from '../api';
import type { ContractorInput } from '../types';

export function useCreateContractor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ContractorInput) => createContractor(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractors'] }),
  });
}

export function useUpdateContractor(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<ContractorInput>) => updateContractor(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractors'] }),
  });
}

export function useDeleteContractor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteContractor(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractors'] }),
  });
}
