import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createUser, resetUserPassword, updateUser, updateUserStatus } from '../api';
import type { UserInput } from '../types';

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UserInput) => createUser(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['configuracoes-users'] }),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<UserInput>) => updateUser(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['configuracoes-users'] }),
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateUserStatus(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['configuracoes-users'] }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
  });
}
