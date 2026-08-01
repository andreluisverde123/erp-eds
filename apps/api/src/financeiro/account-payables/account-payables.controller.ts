import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { AccountPayablesService } from './account-payables.service';
import { CreateAccountPayableDto } from './dto/create-account-payable.dto';
import { QueryAccountPayableDto } from './dto/query-account-payable.dto';
import { UpdateAccountPayableDto } from './dto/update-account-payable.dto';
import { UpdateAccountPayableStatusDto } from './dto/update-account-payable-status.dto';

@Controller('account-payables')
@RequirePermissions('financeiro.view')
export class AccountPayablesController {
  constructor(private readonly accountPayablesService: AccountPayablesService) {}

  @Get()
  findAll(@Query() query: QueryAccountPayableDto, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.findAll(companyId, query);
  }

  // Precisa vir antes de `:id` — senão "summary" seria interpretado como id.
  @Get('summary')
  getSummary(@CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.getSummary(companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.findOne(companyId, id);
  }

  @RequirePermissions('financeiro.manage')
  @Post()
  create(@Body() dto: CreateAccountPayableDto, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.create(companyId, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountPayableDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.update(companyId, id, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountPayableStatusDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.updateStatus(companyId, id, dto.status);
  }

  @RequirePermissions('financeiro.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.remove(companyId, id);
  }
}
