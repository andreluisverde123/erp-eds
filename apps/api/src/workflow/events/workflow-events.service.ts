import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredPermissionFor } from '../common/entity-permission.util';
import { CreateWorkflowEventDto } from './dto/create-workflow-event.dto';

@Injectable()
export class WorkflowEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    userPermissions: string[],
    dto: CreateWorkflowEventDto,
  ) {
    const requiredPermission = requiredPermissionFor(dto.entityType);
    if (!requiredPermission || !userPermissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        'Você não tem permissão para registrar eventos para este tipo de registro.',
      );
    }

    await this.assertEntityExists(companyId, dto.entityType, dto.entityId);

    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: dto.entityType,
      entityId: dto.entityId,
      changes: dto.changes as Prisma.InputJsonValue | undefined,
    });

    return { success: true };
  }

  private async assertEntityExists(
    companyId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    const exists = await (() => {
      switch (entityType) {
        case 'PurchaseRequest':
          return this.prisma.purchaseRequest.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });
        case 'PurchaseOrder':
          return this.prisma.purchaseOrder.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });
        case 'Invoice':
          return this.prisma.invoice.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });
        case 'AccountPayable':
          return this.prisma.accountPayable.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });
        case 'Employee':
          return this.prisma.employee.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });
        default:
          return null;
      }
    })();

    if (!exists) {
      throw new BadRequestException('Registro informado não existe.');
    }
  }
}
