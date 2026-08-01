import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { requiredPermissionFor } from '../common/entity-permission.util';
import { CreateWorkflowCommentDto } from './dto/create-workflow-comment.dto';

@Injectable()
export class WorkflowCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    userId: string,
    userPermissions: string[],
    dto: CreateWorkflowCommentDto,
  ) {
    const requiredPermission = requiredPermissionFor(dto.entityType);
    if (!requiredPermission || !userPermissions.includes(requiredPermission)) {
      throw new ForbiddenException('Você não tem permissão para comentar neste registro.');
    }

    return this.prisma.workflowComment.create({
      data: {
        companyId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        authorId: userId,
        body: dto.body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
  }

  async findForEntity(companyId: string, entityType: string, entityId: string) {
    return this.prisma.workflowComment.findMany({
      where: { companyId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
  }
}
