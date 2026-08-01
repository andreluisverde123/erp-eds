import { ForbiddenException, Injectable } from '@nestjs/common';

import { UploadPolicyService } from '../../common/uploads/upload-policy.service';
import { StorageService } from '../../storage/storage.module';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredPermissionFor } from '../common/entity-permission.util';

@Injectable()
export class WorkflowAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  private assertPermission(entityType: string, userPermissions: string[]): void {
    const requiredPermission = requiredPermissionFor(entityType);
    if (!requiredPermission || !userPermissions.includes(requiredPermission)) {
      throw new ForbiddenException('Você não tem permissão para anexar arquivos a este registro.');
    }
  }

  async upload(
    companyId: string,
    userId: string,
    userPermissions: string[],
    entityType: string,
    entityId: string,
    file: Express.Multer.File,
  ) {
    this.assertPermission(entityType, userPermissions);

    await this.uploadPolicy.assertUploadAllowed(companyId, file);
    const { fileUrl } = await this.storage.saveUpload(`workflow/${entityType}`, file);

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
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  async findForEntity(companyId: string, entityType: string, entityId: string) {
    return this.prisma.attachment.findMany({
      where: { companyId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }
}
