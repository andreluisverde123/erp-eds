import { Module } from '@nestjs/common';

import { SystemUsersController } from './users/system-users.controller';
import { SystemUsersService } from './users/system-users.service';

/// Administração: gestão dos usuários que têm acesso ao sistema. Os perfis
/// (RBAC) continuam sendo administrados pelo módulo de Configurações — aqui
/// eles só são consumidos, sempre por `roleId`.
@Module({
  controllers: [SystemUsersController],
  providers: [SystemUsersService],
})
export class AdministracaoModule {}
