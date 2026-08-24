import { useQuery } from '@tanstack/react-query';

import { listBankAccounts } from '../api';
import type { BankAccountOwnerType } from '../types';

/// Contas bancárias de um titular. A queryKey inclui o dono porque não existe
/// listagem geral — cada tela pede as contas de uma pessoa só.
export function useBankAccounts(
  ownerType: BankAccountOwnerType,
  ownerId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['bank-accounts', ownerType, ownerId],
    queryFn: () => listBankAccounts(ownerType, ownerId as string),
    enabled: Boolean(ownerId) && enabled,
  });
}
