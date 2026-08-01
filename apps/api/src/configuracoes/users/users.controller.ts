import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersManagementService } from './users.service';

@Controller('users')
@RequirePermissions('admin.manage_users')
export class UsersManagementController {
  constructor(private readonly usersService: UsersManagementService) {}

  @Get()
  findAll(@Query() query: QueryUserDto, @CurrentUser('companyId') companyId: string) {
    return this.usersService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.usersService.findOne(companyId, id);
  }

  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.usersService.create(companyId, userId, ip, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.usersService.update(companyId, userId, ip, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.usersService.updateStatus(companyId, userId, ip, id, dto.isActive);
  }

  @Post(':id/reset-password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.usersService.resetPassword(companyId, userId, ip, id);
  }
}
