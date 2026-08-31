import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DiarioReportDetail } from '../types';

/// Mutação de uma seção do RDO.
///
/// Toda operação de item devolve o relatório INTEIRO, com o resumo
/// recalculado, então a resposta é escrita direto no cache em vez de disparar
/// um refetch: o dado já chegou, e buscar de novo seria uma segunda ida ao
/// servidor para saber o que ele acabou de dizer.
///
/// A Home é invalidada porque mostra "último RDO" por obra — essa, sim,
/// precisa recarregar.
export function useReportMutation<TInput>(
  reportId: string,
  fn: (input: TInput) => Promise<DiarioReportDetail>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: (relatorio) => {
      queryClient.setQueryData(['diario', 'relatorios', reportId], relatorio);
      void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });
    },
  });
}
