import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { UploadPolicyService } from '../common/uploads/upload-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.module';
import { findAttachmentEntity, type AttachmentEntity } from './attachment-entities';

const attachmentSelect = {
  id: true,
  fileName: true,
  fileUrl: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  async findForEntity(
    companyId: string,
    permissions: string[],
    entityType: string,
    entityId: string,
  ) {
    const entity = this.resolve(entityType, permissions, 'view');
    await this.assertEntityBelongsToCompany(entity, companyId, entityId);

    return this.prisma.attachment.findMany({
      where: { companyId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: attachmentSelect,
    });
  }

  async upload(
    companyId: string,
    userId: string,
    permissions: string[],
    entityType: string,
    entityId: string,
    file: Express.Multer.File,
  ) {
    const entity = this.resolve(entityType, permissions, 'manage');
    await this.assertEntityBelongsToCompany(entity, companyId, entityId);
    await this.uploadPolicy.assertUploadAllowed(companyId, file);

    const { fileUrl } = await this.storage.saveUpload(`entities/${entityType}`, file);

    return this.prisma.attachment.create({
      data: {
        companyId,
        entityType,
        entityId,
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: userId,
      },
      select: attachmentSelect,
    });
  }

  /// Soft delete, como o resto do sistema — e o arquivo continua no storage.
  /// Apagar o binário aqui tornaria a exclusão irreversível justo agora que a
  /// lixeira existe; limpeza de órfãos é assunto de rotina, não de request.
  async remove(companyId: string, permissions: string[], id: string): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, entityType: true },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');

    this.resolve(attachment.entityType, permissions, 'manage');

    await this.prisma.attachment.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  private resolve(
    entityType: string,
    permissions: string[],
    action: 'view' | 'manage',
  ): AttachmentEntity {
    const entity = findAttachmentEntity(entityType);
    if (!entity) throw new NotFoundException('Tipo de registro não aceita anexos.');

    // Anexar é escrita: exige `<módulo>.manage`. O endpoint antigo de anexos
    // do workflow pedia só `.view`, o que deixava quem tinha acesso apenas de
    // consulta subir arquivo no registro.
    if (!permissions.includes(`${entity.module}.${action}`)) {
      throw new ForbiddenException(
        action === 'view'
          ? `Você não tem permissão para ver anexos de ${entity.label}.`
          : `Você não tem permissão para anexar arquivos em ${entity.label}.`,
      );
    }

    return entity;
  }

  private async assertEntityBelongsToCompany(
    entity: AttachmentEntity,
    companyId: string,
    entityId: string,
  ): Promise<void> {
    const key = entity.model.charAt(0).toLowerCase() + entity.model.slice(1);
    const delegate = (
      this.prisma as unknown as Record<
        string,
        { findFirst(args: unknown): Promise<unknown> } | undefined
      >
    )[key];
    if (!delegate) {
      // Só acontece se o catálogo listar um modelo que não existe no schema.
      throw new NotFoundException('Tipo de registro não aceita anexos.');
    }

    const found = await delegate.findFirst({ where: { id: entityId, ...entity.scope(companyId) } });
    if (!found) throw new NotFoundException(`${entity.label} não encontrada.`);
  }
}
