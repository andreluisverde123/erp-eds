import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSystemUser,
  resetSystemUserPassword,
  updateSystemUser,
  updateSystemUserDiarioAccess,
  updateSystemUserStatus,
} from '../api';
import type { SystemUserInput } from '../types';

/// A tela de Configurações > Usuários lê os mesmos registros com outra
/// queryKey: invalidar as duas evita que ela mostre por até 30s (staleTime)
/// um usuário que acabou de mudar aqui.
function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  queryClient.invalidateQueries({ queryKey: ['configuracoes-users'] });
}

export function useCreateSystemUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SystemUserInput) => createSystemUser(input),
    onSuccess: () => invalidateUsers(queryClient),
  });
}

export function useUpdateSystemUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<SystemUserInput>) => updateSystemUser(id, input),
    onSuccess: () => invalidateUsers(queryClient),
  });
}

/// A senha temporária vem no `data` desta mutation e é exibida uma única vez.
/// Não vai para o cache de nenhuma query — o `invalidateUsers` recarrega os
/// usuários pelo endpoint normal, que nunca devolve senha.
export function useResetSystemUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resetSystemUserPassword(id),
    onSuccess: () => invalidateUsers(queryClient),
  });
}

export function useUpdateSystemUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateSystemUserStatus(id, isActive),
    onSuccess: () => invalidateUsers(queryClient),
  });
}

/// Interruptor do Diário de Obras, por pessoa.
export function useUpdateSystemUserDiarioAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, diarioEnabled }: { id: string; diarioEnabled: boolean }) =>
      updateSystemUserDiarioAccess(id, diarioEnabled),
    onSuccess: () => invalidateUsers(queryClient),
  });
}
