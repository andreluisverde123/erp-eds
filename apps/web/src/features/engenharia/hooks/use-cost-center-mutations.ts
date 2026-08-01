import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createCostCenter, deleteCostCenter, updateCostCenter } from '../api';
import type { CostCenterInput } from '../types';

/// Uma obra embute a lista de centros de custo no seu detalhe, então toda
/// mutação de centro de custo precisa invalidar as duas árvores de query.
function invalidateEngenharia(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
  queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CostCenterInput) => createCostCenter(input),
    onSuccess: () => invalidateEngenharia(queryClient),
  });
}

export function useUpdateCostCenter(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<CostCenterInput>) => updateCostCenter(id, input),
    onSuccess: () => invalidateEngenharia(queryClient),
  });
}

export function useDeleteCostCenter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCostCenter(id),
    onSuccess: () => invalidateEngenharia(queryClient),
  });
}
