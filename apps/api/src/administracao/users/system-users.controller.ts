import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateSystemUserDto } from './dto/create-system-user.dto';
import { QuerySystemUserDto } from './dto/query-system-user.dto';
import { UpdateUserDiarioDto } from './dto/update-user-diario.dto';
import { UpdateSystemUserStatusDto } from './dto/update-system-user-status.dto';
import { UpdateSystemUserDto } from './dto/update-system-user.dto';
import { SystemUsersService } from './system-users.service';

/// Módulo Administração > Usuários. Mesma permissão do restante da área
/// administrativa: quem gerencia acesso é administrador.
@Controller('admin/users')
@RequirePermissions('admin.manage_users')
export class SystemUsersController {
  constructor(private readonly systemUsers: SystemUsersService) {}

  @Get()
  findAll(@Query() query: QuerySystemUserDto, @CurrentUser('companyId') companyId: string) {
    return this.systemUsers.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.systemUsers.findOne(companyId, id);
  }

  @Post()
  create(
    @Body() dto: CreateSystemUserDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.systemUsers.create(companyId, actingUserId, ip, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSystemUserDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.systemUsers.update(companyId, actingUserId, ip, id, dto);
  }

  /// Devolve a senha temporária em texto puro no corpo da resposta — é a
  /// única vez que ela existe fora do hash. O front a mostra em um modal e
  /// não a guarda em lugar nenhum.
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.systemUsers.resetPassword(companyId, actingUserId, ip, id);
  }

  @Patch(':id/diario')
  updateDiarioAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDiarioDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.systemUsers.updateDiarioAccess(companyId, userId, ip, id, dto.diarioEnabled);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSystemUserStatusDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.systemUsers.updateStatus(companyId, actingUserId, ip, id, dto.isActive);
  }
}
