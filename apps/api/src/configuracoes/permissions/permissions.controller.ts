import { Controller, Get } from '@nestjs/common';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsService } from './permissions.service';

/// Catálogo de permissões é somente leitura por aqui — novas permissões são
/// adicionadas via código (seed.ts) quando um módulo novo é criado, nunca
/// via UI. Ver PermissionManagementService... o "management" real de
/// permissões (marcar/desmarcar) acontece na composição de um Perfil
/// (ver RolesManagementController).
@Controller('permissions')
@RequirePermissions('admin.manage_users')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  findAll() {
    return this.permissionsService.findAll();
  }
}
