import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createAccountPayable } from '../api';

/// Depois de lançar, a listagem E o resumo mudam — o resumo soma o que está
/// em aberto, então invalidar só a lista deixaria os cards desatualizados.
export function useCreateAccountPayable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAccountPayable,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-payables'] });
    },
  });
}
