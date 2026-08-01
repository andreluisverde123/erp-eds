import { Module } from '@nestjs/common';

import { AuditLogsController } from './audit-logs/audit-logs.controller';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { CompanyController } from './company/company.controller';
import { CompanyService } from './company/company.service';
import { NotificationPreferencesController } from './notification-preferences/notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences/notification-preferences.service';
import { PermissionsController } from './permissions/permissions.controller';
import { PermissionsService } from './permissions/permissions.service';
import { RolesManagementController } from './roles/roles.controller';
import { RolesManagementService } from './roles/roles.service';
import { SystemSettingsController } from './system-settings/system-settings.controller';
import { SystemSettingsService } from './system-settings/system-settings.service';
import { UsersManagementController } from './users/users.controller';
import { UsersManagementService } from './users/users.service';

/// Módulo administrativo transversal (acessível só a Administradores via
/// permissão `admin.manage_users`). Reúne empresa, usuários, perfis,
/// catálogo de permissões, auditoria, preferências de notificação e
/// parâmetros gerais do sistema.
@Module({
  controllers: [
    CompanyController,
    UsersManagementController,
    RolesManagementController,
    PermissionsController,
    AuditLogsController,
    NotificationPreferencesController,
    SystemSettingsController,
  ],
  providers: [
    CompanyService,
    UsersManagementService,
    RolesManagementService,
    PermissionsService,
    AuditLogsService,
    NotificationPreferencesService,
    SystemSettingsService,
  ],
})
export class ConfiguracoesModule {}
