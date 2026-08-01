import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { requiredPermissionForEntity } from './entity-permissions.constant';

/// Somente leitura — auditoria nunca é editável nem excluível pela API.
@Controller('audit-logs')
@RequirePermissions('admin.manage_users')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: QueryAuditLogDto, @CurrentUser('companyId') companyId: string) {
    return this.auditLogsService.findAll(companyId, query);
  }

  @Get('modules')
  getModules() {
    return this.auditLogsService.getModules();
  }

  /// Histórico de um registro específico — diferente de `findAll`, não é
  /// admin-only: qualquer usuário com acesso ao MÓDULO dono daquele
  /// `entityType` pode ver (permissão resolvida em runtime, mesmo padrão de
  /// `workflow/common/entity-permission.util.ts`).
  @Get('entity/:entityType/:entityId')
  @RequirePermissions('dashboard.view')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const requiredPermission = requiredPermissionForEntity(entityType);
    if (!requiredPermission || !user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException('Você não tem permissão para ver o histórico deste registro.');
    }

    return this.auditLogsService.findForEntity(user.companyId, entityType, entityId);
  }
}
