import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async findCurrent(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    return company;
  }

  async update(
    companyId: string,
    userId: string,
    ipAddress: string | undefined,
    dto: UpdateCompanyDto,
  ) {
    await this.findCurrent(companyId);

    const updated = await this.prisma.company.update({ where: { id: companyId }, data: dto });

    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: companyId,
      ipAddress,
      changes: dto as Prisma.InputJsonValue,
    });

    return updated;
  }

  async updateLogo(
    companyId: string,
    userId: string,
    ipAddress: string | undefined,
    logoUrl: string,
  ) {
    await this.findCurrent(companyId);

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { logoUrl },
    });

    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: companyId,
      ipAddress,
      changes: { logoUrl },
    });

    return updated;
  }
}
