import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approvePayment,
  downloadPaymentSchedulePdf,
  getPaymentSchedule,
  revokePaymentApproval,
} from '../api';

/// Programação de pagamentos da semana. `week` é qualquer dia dela
/// (AAAA-MM-DD); a API devolve a segunda e o domingo correspondentes.
export function usePaymentSchedule(week: string) {
  return useQuery({
    queryKey: ['account-payables', 'schedule', week],
    queryFn: () => getPaymentSchedule(week),
    placeholderData: keepPreviousData,
  });
}

/// Liberar ou desfazer muda a programação E a lista de Contas a Pagar, que
/// mostra a mesma conta — por isso invalida o prefixo inteiro.
export function useApprovePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => approvePayment(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-payables'] }),
  });
}

export function useRevokePaymentApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokePaymentApproval(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-payables'] }),
  });
}

export function useDownloadPaymentSchedulePdf() {
  return useMutation({ mutationFn: (week: string) => downloadPaymentSchedulePdf(week) });
}
