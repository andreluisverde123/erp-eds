import {
  Body,
  Controller,
  Delete,
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
import { CreateRoleDto } from './dto/create-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesManagementService } from './roles.service';

@Controller('roles')
@RequirePermissions('admin.manage_users')
export class RolesManagementController {
  constructor(private readonly rolesService: RolesManagementService) {}

  @Get()
  findAll(@Query() query: QueryRoleDto, @CurrentUser('companyId') companyId: string) {
    return this.rolesService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.rolesService.findOne(companyId, id);
  }

  @Post()
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.rolesService.create(companyId, userId, ip, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.rolesService.update(companyId, userId, ip, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.rolesService.remove(companyId, userId, ip, id);
  }
}
