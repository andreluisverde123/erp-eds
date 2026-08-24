import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  BankAccount,
  BankAccountInput,
  BankAccountListResult,
  BankAccountOwnerType,
  PaginatedResult,
  RoleOption,
  SystemUser,
  SystemUserInput,
  SystemUserQuery,
  SystemUserWithTemporaryPassword,
  RevealedBankAccount,
} from './types';

export function listSystemUsers(query: SystemUserQuery): Promise<PaginatedResult<SystemUser>> {
  return apiClient.get(`/admin/users${toQueryString(query)}`);
}

export function getSystemUser(id: string): Promise<SystemUser> {
  return apiClient.get(`/admin/users/${id}`);
}

export function createSystemUser(input: SystemUserInput): Promise<SystemUserWithTemporaryPassword> {
  return apiClient.post('/admin/users', input);
}

/// Gera uma nova senha temporária e devolve UMA única vez o valor em texto
/// puro. O usuário volta ao fluxo de primeiro acesso e as sessões abertas dele
/// são revogadas pela API.
export function resetSystemUserPassword(id: string): Promise<SystemUserWithTemporaryPassword> {
  return apiClient.post(`/admin/users/${id}/reset-password`);
}

export function updateSystemUser(id: string, input: Partial<SystemUserInput>): Promise<SystemUser> {
  return apiClient.patch(`/admin/users/${id}`, input);
}

export function updateSystemUserStatus(id: string, isActive: boolean): Promise<SystemUser> {
  return apiClient.patch(`/admin/users/${id}/status`, { isActive });
}

/// Perfis vêm do endpoint já existente de Configurações > Perfis: este módulo
/// consome o cadastro, não mantém um paralelo.
export function listRoleOptions(): Promise<PaginatedResult<RoleOption>> {
  return apiClient.get('/roles?limit=100');
}

// ---------------------------------------------------------------------------
// Dados bancários
// ---------------------------------------------------------------------------

/// Sempre de um titular só: não existe "listar todas as contas da empresa" —
/// uma tela dessas seria um dump de dado sensível.
export function listBankAccounts(
  ownerType: BankAccountOwnerType,
  ownerId: string,
): Promise<BankAccountListResult> {
  return apiClient.get(`/admin/bank-accounts${toQueryString({ ownerType, ownerId })}`);
}

export function createBankAccount(input: BankAccountInput): Promise<BankAccount> {
  return apiClient.post('/admin/bank-accounts', input);
}

/// O DONO não vai no corpo: mudar a conta de pessoa é cadastrar outra conta.
export function updateBankAccount(
  id: string,
  input: Partial<Omit<BankAccountInput, 'ownerType' | 'ownerId'>>,
): Promise<BankAccount> {
  return apiClient.patch(`/admin/bank-accounts/${id}`, input);
}

export function updateBankAccountStatus(id: string, isActive: boolean): Promise<BankAccount> {
  return apiClient.patch(`/admin/bank-accounts/${id}/status`, { isActive });
}

/// POST, e não GET, apesar de só ler: um GET com número de conta na resposta
/// entra em histórico e cache de proxy. Cada chamada vira linha de auditoria.
export function revealBankAccount(id: string): Promise<RevealedBankAccount> {
  return apiClient.post(`/admin/bank-accounts/${id}/reveal`);
}
