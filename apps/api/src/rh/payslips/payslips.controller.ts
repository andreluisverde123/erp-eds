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
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { QueryPayslipDto } from './dto/query-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { PayslipsService } from './payslips.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('payslips')
@RequirePermissions('rh.view')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  findAll(@Query() query: QueryPayslipDto, @CurrentUser('companyId') companyId: string) {
    return this.payslipsService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.payslipsService.findOne(companyId, id);
  }

  @RequirePermissions('rh.manage')
  @Post()
  create(@Body() dto: CreatePayslipDto, @CurrentUser('companyId') companyId: string) {
    return this.payslipsService.create(companyId, dto);
  }

  @RequirePermissions('rh.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayslipDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.payslipsService.update(companyId, id, dto);
  }

  @RequirePermissions('rh.manage')
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
    return this.payslipsService.attachFile(companyId, id, file, userId);
  }

  @RequirePermissions('rh.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.payslipsService.remove(companyId, id);
  }
}
