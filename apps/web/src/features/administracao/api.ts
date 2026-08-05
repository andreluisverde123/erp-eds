import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  PaginatedResult,
  RoleOption,
  SystemUser,
  SystemUserInput,
  SystemUserQuery,
  SystemUserWithTemporaryPassword,
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
