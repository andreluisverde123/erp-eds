export type SettingsTheme = 'LIGHT' | 'DARK' | 'SYSTEM';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Company {
  id: string;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  stateRegistration: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  responsibleName: string | null;
}

export interface CompanyInput {
  tradeName?: string;
  legalName?: string;
  stateRegistration?: string;
  phone?: string;
  email?: string;
  website?: string;
  zipCode?: string;
  addressLine?: string;
  addressNumber?: string;
  addressComplement?: string;
  city?: string;
  state?: string;
  responsibleName?: string;
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  isActive: boolean;
  roles: RoleRef[];
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  position?: string;
  roleId: string;
}

export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  roleId?: string;
}

export interface Role {
  id: string;
  name: string;
  type: string;
  description: string | null;
  isSystem: boolean;
  permissionCodes: string[];
  userCount: number;
}

export interface RoleInput {
  name: string;
  type: string;
  description?: string;
  permissionCodes: string[];
}

export interface RoleQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  changes: unknown;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  userId?: string;
  module?: string;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
}

export interface NotificationPreference {
  id: string;
  eventKey: string;
  label: string;
  module: string;
  channelSystem: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  channelPush: boolean;
}

export interface NotificationPreferenceInput {
  channelSystem: boolean;
  channelEmail: boolean;
}

export interface SystemSettings {
  id: string;
  erpName: string;
  theme: SettingsTheme;
  language: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  firstDayOfWeek: number;
  dueDateAlertDays: number;
  /// Alçada de aprovação em reais. `0` = sem alçada (padrão).
  purchaseApprovalThreshold: string;
  paymentApprovalThreshold: string;
  maxUploadSizeMb: number;
  allowAttachments: boolean;
  notificationsEnabled: boolean;
  auditEnabled: boolean;
}

/// A API devolve os valores de alçada como string (Decimal do Prisma) e
/// recebe número no update — daí os dois campos saírem do Partial genérico.
export type SystemSettingsInput = Partial<
  Omit<SystemSettings, 'id' | 'purchaseApprovalThreshold' | 'paymentApprovalThreshold'>
> & {
  purchaseApprovalThreshold?: number;
  paymentApprovalThreshold?: number;
};
