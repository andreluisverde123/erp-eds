import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { ContractDocumentsService } from './contract-documents.service';
import { CreateContractDocumentDto } from './dto/create-contract-document.dto';
import { QueryContractDocumentDto } from './dto/query-contract-document.dto';
import { UpdateContractDocumentDto } from './dto/update-contract-document.dto';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('contract-documents')
export class ContractDocumentsController {
  constructor(private readonly contractDocumentsService: ContractDocumentsService) {}

  @RequirePermissions('terceiros.view')
  @Get()
  findAll(@Query() query: QueryContractDocumentDto, @CurrentUser('companyId') companyId: string) {
    return this.contractDocumentsService.findAll(companyId, query);
  }

  // Precisa vir antes de ":id".
  @RequirePermissions('terceiros.view')
  @Get('expiring-summary')
  getExpiringSummary(@CurrentUser('companyId') companyId: string) {
    return this.contractDocumentsService.getExpiringSummary(companyId);
  }

  @RequirePermissions('terceiros.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractDocumentsService.findOne(companyId, id);
  }

  @RequirePermissions('terceiros.manage')
  @Post()
  create(@Body() dto: CreateContractDocumentDto, @CurrentUser('companyId') companyId: string) {
    return this.contractDocumentsService.create(companyId, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDocumentDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.contractDocumentsService.update(companyId, id, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          callback(new BadRequestException('Só é permitido enviar arquivos PDF.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.contractDocumentsService.attachFile(companyId, id, file, userId);
  }

  @RequirePermissions('terceiros.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractDocumentsService.remove(companyId, id);
  }
}
