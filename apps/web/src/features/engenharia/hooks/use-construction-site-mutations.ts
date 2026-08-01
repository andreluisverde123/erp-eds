import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createConstructionSite, deleteConstructionSite, updateConstructionSite } from '../api';
import type { ConstructionSiteInput } from '../types';

export function useCreateConstructionSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConstructionSiteInput) => createConstructionSite(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

export function useUpdateConstructionSite(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<ConstructionSiteInput>) => updateConstructionSite(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

export function useDeleteConstructionSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteConstructionSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}
