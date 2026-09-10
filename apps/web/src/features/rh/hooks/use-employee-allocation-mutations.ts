import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createEmployeeAllocation,
  deleteEmployeeAllocation,
  transferEmployee,
  updateEmployeeAllocation,
} from '../api';
import type { EmployeeAllocationInput, EmployeeTransferInput } from '../types';

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

/// Transferência de obra. Invalida as duas listas pelo mesmo motivo das
/// demais — mas aqui vale lembrar que UM pedido mexe em DUAS alocações: a
/// anterior ganha data de fim e a nova nasce em aberto.
export function useTransferEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EmployeeTransferInput) => transferEmployee(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-allocations'] });
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
