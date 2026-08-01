import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createContractEmployee, deleteContractEmployee, updateContractEmployee } from '../api';
import type { ContractEmployeeInput } from '../types';

export function useCreateContractEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ContractEmployeeInput) => createContractEmployee(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-employees'] }),
  });
}

export function useUpdateContractEmployee(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<ContractEmployeeInput>) => updateContractEmployee(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-employees'] }),
  });
}

export function useDeleteContractEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteContractEmployee(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-employees'] }),
  });
}
