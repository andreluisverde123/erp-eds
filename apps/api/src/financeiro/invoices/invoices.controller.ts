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
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@RequirePermissions('financeiro.view')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@Query() query: QueryInvoiceDto, @CurrentUser('companyId') companyId: string) {
    return this.invoicesService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.invoicesService.findOne(companyId, id);
  }

  @RequirePermissions('financeiro.manage')
  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser('companyId') companyId: string) {
    return this.invoicesService.create(companyId, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.invoicesService.update(companyId, id, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.invoicesService.updateStatus(companyId, id, dto.status);
  }

  @RequirePermissions('financeiro.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.invoicesService.remove(companyId, id);
  }
}
