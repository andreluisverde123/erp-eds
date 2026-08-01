import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createTimeEntry, deleteTimeEntry } from '../api';
import type { TimeEntryInput } from '../types';

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TimeEntryInput) => createTimeEntry(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-entries'] }),
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTimeEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-entries'] }),
  });
}
