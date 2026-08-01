import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listTrash, restoreTrashItem } from '../api';

export function useTrash(entityType?: string) {
  return useQuery({
    queryKey: ['trash', 'list', entityType ?? 'all'],
    queryFn: () => listTrash(entityType),
  });
}

export function useRestoreTrashItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: string }) =>
      restoreTrashItem(entityType, id),
    onSuccess: () => {
      // A lixeira encolhe e o registro reaparece na listagem do módulo dele —
      // invalidar tudo é mais simples (e mais seguro) do que mapear qual
      // queryKey pertence a qual entityType.
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      void queryClient.invalidateQueries();
    },
  });
}
