import { useMutation, useQueryClient } from '@tanstack/react-query';

/// Reaproveita a função de delete individual já existente de cada módulo,
/// disparando-a em paralelo para os ids selecionados — não introduz nenhuma
/// regra de negócio nova, só orquestra chamadas ao endpoint que já existe.
export function useBulkDelete(deleteFn: (id: string) => Promise<unknown>, queryKeyPrefix: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteFn(id)));
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      return { failedCount, total: ids.length };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [queryKeyPrefix] });
    },
  });
}
