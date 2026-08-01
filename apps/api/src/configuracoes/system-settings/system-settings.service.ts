import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(companyId: string) {
    const existing = await this.prisma.systemSettings.findUnique({ where: { companyId } });
    if (existing) return existing;
    return this.prisma.systemSettings.create({ data: { companyId } });
  }

  async update(companyId: string, dto: UpdateSystemSettingsDto) {
    await this.getOrCreate(companyId);
    return this.prisma.systemSettings.update({ where: { companyId }, data: dto });
  }
}
