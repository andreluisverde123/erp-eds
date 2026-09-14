import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getReferenceComposition,
  getReferenceDataset,
  importReferenceDataset,
  listReferenceDatasets,
  searchReferenceCompositions,
  searchReferenceItems,
} from './api';
import type { ReferenceDatasetQuery, ReferenceImportInput, ReferenceSearchQuery } from './types';

export function useReferenceDatasets(query: ReferenceDatasetQuery) {
  return useQuery({ queryKey: ['reference-datasets', query], queryFn: () => listReferenceDatasets(query) });
}

export function useReferenceDataset(id: string) {
  return useQuery({ queryKey: ['reference-dataset', id], queryFn: () => getReferenceDataset(id), enabled: Boolean(id) });
}

export function useReferenceItems(id: string, query: ReferenceSearchQuery, enabled = true) {
  return useQuery({
    queryKey: ['reference-dataset', id, 'items', query],
    queryFn: () => searchReferenceItems(id, query),
    enabled: enabled && Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useReferenceCompositions(id: string, query: ReferenceSearchQuery, enabled = true) {
  return useQuery({
    queryKey: ['reference-dataset', id, 'compositions', query],
    queryFn: () => searchReferenceCompositions(id, query),
    enabled: enabled && Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useReferenceComposition(compositionId: string | null) {
  return useQuery({
    queryKey: ['reference-composition', compositionId],
    queryFn: () => getReferenceComposition(compositionId!),
    enabled: Boolean(compositionId),
  });
}

export function useImportReferenceDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, fileHash }: { input: ReferenceImportInput; fileHash: string }) =>
      importReferenceDataset(input, fileHash),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reference-datasets'] }),
  });
}
