import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAttendanceDay, getAttendanceSummary, saveAttendanceDay } from '../api';
import type { AttendanceDayInput } from '../types';

/// A chamada de uma obra num dia.
///
/// Só busca quando obra E data existem: sem as duas, a pergunta "quem trabalhou"
/// não está formada, e disparar a consulta traria a chamada de uma obra
/// arbitrária.
export function useAttendanceDay(constructionSiteId: string | null, date: string) {
  return useQuery({
    queryKey: ['attendance', 'day', constructionSiteId, date],
    queryFn: () => getAttendanceDay(constructionSiteId!, date),
    enabled: Boolean(constructionSiteId && date),
  });
}

export function useAttendanceSummary(query: {
  employeeId?: string;
  constructionSiteId?: string;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ['attendance', 'summary', query],
    queryFn: () => getAttendanceSummary(query),
    enabled: Boolean(query.employeeId || query.constructionSiteId),
  });
}

export function useSaveAttendanceDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AttendanceDayInput) => saveAttendanceDay(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      // A ALOCAÇÃO não é invalidada de propósito: apontar presença não a
      // altera. Faltar não tira ninguém da obra.
    },
  });
}
