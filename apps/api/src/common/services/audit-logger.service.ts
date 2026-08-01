import { Injectable } from '@nestjs/common';

import { Prisma, type AuditAction } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogEntry {
  companyId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  changes?: Prisma.InputJsonValue;
}

/// Ponto único de escrita em `AuditLog`, disponível globalmente (ver
/// CommonModule) para qualquer módulo do sistema — não só Configurações.
/// Um módulo novo só precisa injetar `AuditLoggerService` no service e
/// chamar `.log(...)` depois de criar/editar/remover algo relevante; nenhuma
/// outra camada precisa saber que auditoria existe.
@Injectable()
export class AuditLoggerService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.userId ?? undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress ?? undefined,
        changes: entry.changes,
      },
    });
  }
}
