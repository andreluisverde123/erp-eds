import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addCompositionItem,
  createComposition,
  deleteComposition,
  getComposition,
  listCompositions,
  removeCompositionItem,
  updateComposition,
  updateCompositionItem,
} from '../api';
import type {
  Composition,
  CompositionInput,
  CompositionItemInput,
  CompositionItemUpdate,
  CompositionQuery,
} from '../types';

export function useCompositions(query: CompositionQuery) {
  return useQuery({
    queryKey: ['compositions', query],
    queryFn: () => listCompositions(query),
  });
}

export function useComposition(id: string) {
  return useQuery({
    queryKey: ['composition', id],
    queryFn: () => getComposition(id),
    enabled: Boolean(id),
  });
}

/// Depois de qualquer escrita: a composição que a API devolveu vira o cache do
/// detalhe — é ela que traz o custo recalculado —, e a listagem é recarregada,
/// porque o custo unitário aparece lá também.
function useRefresh() {
  const queryClient = useQueryClient();
  return (compositionId: string, composicao?: Composition | void) => {
    if (composicao) queryClient.setQueryData(['composition', compositionId], composicao);
    else queryClient.invalidateQueries({ queryKey: ['composition', compositionId] });
    queryClient.invalidateQueries({ queryKey: ['compositions'] });
  };
}

export function useCreateComposition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: CompositionInput) => createComposition(input),
    onSuccess: (composicao) => refresh(composicao.id, composicao),
  });
}

export function useUpdateComposition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CompositionInput> }) =>
      updateComposition(id, input),
    onSuccess: (composicao, { id }) => refresh(id, composicao),
  });
}

export function useDeleteComposition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => deleteComposition(id),
    onSuccess: (_, id) => refresh(id),
  });
}

export function useAddCompositionItem(compositionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: CompositionItemInput) => addCompositionItem(compositionId, input),
    onSuccess: (composicao) => refresh(compositionId, composicao),
  });
}

export function useUpdateCompositionItem(compositionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: CompositionItemUpdate }) =>
      updateCompositionItem(compositionId, itemId, input),
    onSuccess: (composicao) => refresh(compositionId, composicao),
  });
}

export function useRemoveCompositionItem(compositionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (itemId: string) => removeCompositionItem(compositionId, itemId),
    onSuccess: (composicao) => refresh(compositionId, composicao),
  });
}
