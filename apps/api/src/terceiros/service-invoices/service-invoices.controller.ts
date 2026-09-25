import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { inertAttachmentFileFilter } from '../../common/uploads/attachment-content';
import { CreateServiceInvoiceDto } from './dto/create-service-invoice.dto';
import { QueryServiceInvoiceDto } from './dto/query-service-invoice.dto';
import { ServiceInvoicesService } from './service-invoices.service';

/// Mesmo teto dos anexos em geral (ver `AttachmentsController`).
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/// Notas de serviço de terceirizado, lançadas pela Engenharia. Permissões de
/// TERCEIRIZADOS, e não do Financeiro: a Engenharia lança e acompanha as
/// notas dela sem enxergar as contas da empresa.
@Controller('service-invoices')
@RequirePermissions('terceiros.view')
export class ServiceInvoicesController {
  constructor(private readonly serviceInvoices: ServiceInvoicesService) {}

  @Get()
  findAll(@Query() query: QueryServiceInvoiceDto, @CurrentUser('companyId') companyId: string) {
    return this.serviceInvoices.findAll(companyId, query);
  }

  // Antes de `:id`.
  @Get('cost-centers')
  listCostCenters(@CurrentUser('companyId') companyId: string) {
    return this.serviceInvoices.listCostCenters(companyId);
  }

  @RequirePermissions('terceiros.manage')
  @Post()
  create(
    @Body() dto: CreateServiceInvoiceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.serviceInvoices.create(companyId, userId, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.serviceInvoices.cancel(companyId, id);
  }

  @Get(':id/files')
  listFiles(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.serviceInvoices.listFiles(companyId, id);
  }

  @RequirePermissions('terceiros.manage')
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: inertAttachmentFileFilter,
    }),
  )
  uploadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file) throw new BadRequestException('Selecione o arquivo da nota.');
    return this.serviceInvoices.uploadFile(companyId, userId, id, file);
  }
}
