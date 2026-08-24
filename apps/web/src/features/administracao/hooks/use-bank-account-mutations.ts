import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createBankAccount,
  revealBankAccount,
  updateBankAccount,
  updateBankAccountStatus,
} from '../api';
import type { BankAccountInput } from '../types';

function invalidateBankAccounts(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BankAccountInput) => createBankAccount(input),
    onSuccess: () => invalidateBankAccounts(queryClient),
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Omit<BankAccountInput, 'ownerType' | 'ownerId'>>;
    }) => updateBankAccount(id, input),
    onSuccess: () => invalidateBankAccounts(queryClient),
  });
}

export function useUpdateBankAccountStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateBankAccountStatus(id, isActive),
    onSuccess: () => invalidateBankAccounts(queryClient),
  });
}

/// Os valores completos ficam no `data` desta mutation e vivem só no estado da
/// tela que pediu. Deliberadamente NÃO é um `useQuery`: cache guardaria número
/// de conta em memória por tempo indeterminado, e cada chamada aqui é uma
/// linha de auditoria — repetir por revalidação automática seria mentira no
/// log.
export function useRevealBankAccount() {
  return useMutation({
    mutationFn: (id: string) => revealBankAccount(id),
  });
}
