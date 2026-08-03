import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { assertInertAttachment } from '../../common/uploads/attachment-content';
import { ALLOWED_ENTITY_TYPES, requiredPermissionFor } from '../common/entity-permission.util';
import { WorkflowAttachmentsService } from './workflow-attachments.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('workflow/attachments')
@RequirePermissions('dashboard.view')
export class WorkflowAttachmentsController {
  constructor(private readonly workflowAttachmentsService: WorkflowAttachmentsService) {}

  @Get(':entityType/:entityId')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.workflowAttachmentsService.findForEntity(companyId, entityType, entityId);
  }

  @Post(':entityType/:entityId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // entityType vem da URL — validado contra a allow-list E a permissão do
      // usuário ANTES de o arquivo ser aceito. Os guards globais já rodaram
      // aqui (interceptor roda depois de guard), então `req.user` está
      // populado. Ficava no `destination` do diskStorage; com armazenamento em
      // memória, `fileFilter` é o gancho equivalente.
      fileFilter: (req, file, callback) => {
        const entityType = (req.params as { entityType?: string }).entityType;
        const user = (req as { user?: JwtPayload }).user;

        if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType)) {
          callback(new BadRequestException('Tipo de entidade inválido.'), false);
          return;
        }

        const requiredPermission = requiredPermissionFor(entityType);
        if (!user || !requiredPermission || !user.permissions.includes(requiredPermission)) {
          callback(
            new ForbiddenException('Você não tem permissão para anexar arquivos a este registro.'),
            false,
          );
          return;
        }

        // Mesma barreira de conteúdo ativo do módulo `attachments`: estes
        // arquivos saem pelo mesmo `FilesController`, então o vetor era o mesmo.
        try {
          assertInertAttachment(file);
        } catch (error) {
          callback(error as Error, false);
          return;
        }

        callback(null, true);
      },
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  upload(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.workflowAttachmentsService.upload(
      user.companyId,
      user.sub,
      user.permissions,
      entityType,
      entityId,
      file,
    );
  }
}
