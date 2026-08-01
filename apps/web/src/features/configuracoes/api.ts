import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  AuditLogEntry,
  AuditLogQuery,
  Company,
  CompanyInput,
  NotificationPreference,
  NotificationPreferenceInput,
  PaginatedResult,
  Permission,
  Role,
  RoleInput,
  RoleQuery,
  SystemSettings,
  SystemSettingsInput,
  User,
  UserInput,
  UserQuery,
} from './types';

export function getCompany(): Promise<Company> {
  return apiClient.get('/company');
}

export function updateCompany(input: CompanyInput): Promise<Company> {
  return apiClient.patch('/company', input);
}

export function uploadCompanyLogo(file: File): Promise<Company> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload('/company/logo', formData);
}

export function listUsers(query: UserQuery): Promise<PaginatedResult<User>> {
  return apiClient.get(`/users${toQueryString(query)}`);
}

export function createUser(input: UserInput): Promise<User> {
  return apiClient.post('/users', input);
}

export function updateUser(id: string, input: Partial<UserInput>): Promise<User> {
  return apiClient.patch(`/users/${id}`, input);
}

export function updateUserStatus(id: string, isActive: boolean): Promise<User> {
  return apiClient.patch(`/users/${id}/status`, { isActive });
}

export function resetUserPassword(id: string): Promise<{ temporaryPassword: string }> {
  return apiClient.post(`/users/${id}/reset-password`);
}

export function listRoles(query: RoleQuery): Promise<PaginatedResult<Role>> {
  return apiClient.get(`/roles${toQueryString(query)}`);
}

export function createRole(input: RoleInput): Promise<Role> {
  return apiClient.post('/roles', input);
}

export function updateRole(id: string, input: Partial<RoleInput>): Promise<Role> {
  return apiClient.patch(`/roles/${id}`, input);
}

export function deleteRole(id: string): Promise<void> {
  return apiClient.delete(`/roles/${id}`);
}

export function listPermissions(): Promise<Permission[]> {
  return apiClient.get('/permissions');
}

export function listAuditLogs(query: AuditLogQuery): Promise<PaginatedResult<AuditLogEntry>> {
  return apiClient.get(`/audit-logs${toQueryString(query)}`);
}

export function listAuditLogModules(): Promise<string[]> {
  return apiClient.get('/audit-logs/modules');
}

export function listNotificationPreferences(): Promise<NotificationPreference[]> {
  return apiClient.get('/notification-preferences');
}

export function updateNotificationPreference(
  eventKey: string,
  input: NotificationPreferenceInput,
): Promise<NotificationPreference> {
  return apiClient.patch(`/notification-preferences/${eventKey}`, input);
}

export function getSystemSettings(): Promise<SystemSettings> {
  return apiClient.get('/system-settings');
}

export function updateSystemSettings(input: SystemSettingsInput): Promise<SystemSettings> {
  return apiClient.patch('/system-settings', input);
}
