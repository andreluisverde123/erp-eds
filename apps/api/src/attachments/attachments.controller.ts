import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AttachmentsService } from './attachments.service';

/// Teto absoluto do processo — o arquivo vai para a memória antes de qualquer
/// checagem. O limite POR EMPRESA (`maxUploadSizeMb`, Configurações → Sistema)
/// é aplicado depois, no serviço, e só pode ser mais restritivo que este.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/// Anexos de qualquer registro do sistema: obra, solicitação, ordem de compra,
/// nota, conta a pagar, pagamento, funcionário, terceiro e contrato.
///
/// Sem `@RequirePermissions` na classe: a permissão depende do módulo dono do
/// registro (ver `attachment-entities.ts`), então a checagem é por requisição.
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':entityType/:entityId')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentsService.findForEntity(
      user.companyId,
      user.permissions,
      entityType,
      entityId,
    );
  }

  @Post(':entityType/:entityId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  upload(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.attachmentsService.upload(
      user.companyId,
      user.sub,
      user.permissions,
      entityType,
      entityId,
      file,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.attachmentsService.remove(user.companyId, user.permissions, id);
  }
}
