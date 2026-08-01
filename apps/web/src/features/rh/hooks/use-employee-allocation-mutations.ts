import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createEmployeeAllocation,
  deleteEmployeeAllocation,
  updateEmployeeAllocation,
} from '../api';
import type { EmployeeAllocationInput } from '../types';

export function useCreateEmployeeAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EmployeeAllocationInput) => createEmployeeAllocation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-allocations'] });
      // A obra atual exibida na tela de Funcionários é derivada da alocação.
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useUpdateEmployeeAllocation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<EmployeeAllocationInput>) => updateEmployeeAllocation(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useDeleteEmployeeAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteEmployeeAllocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
