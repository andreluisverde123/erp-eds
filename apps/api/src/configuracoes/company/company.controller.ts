import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { UploadPolicyService } from '../../common/uploads/upload-policy.service';
import { StorageService } from '../../storage/storage.module';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

// SVG fica de fora de propósito: pode conter <script> embutido (XSS
// armazenado se algum dia for renderizado inline em vez de só via <img>).
const ALLOWED_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('company')
@RequirePermissions('admin.manage_users')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  @Get()
  findCurrent(@CurrentUser('companyId') companyId: string) {
    return this.companyService.findCurrent(companyId);
  }

  @Patch()
  update(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    return this.companyService.update(companyId, userId, ip, dto);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Envie um arquivo de imagem (PNG, JPEG ou WebP).'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    await this.uploadPolicy.assertUploadAllowed(companyId, file);
    const { fileUrl } = await this.storage.saveUpload('logos', file);
    return this.companyService.updateLogo(companyId, userId, ip, fileUrl);
  }
}
