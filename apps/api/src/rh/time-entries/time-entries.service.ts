import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, type TimeEntryStatus } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { QueryTimeEntryDto } from './dto/query-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

const includeArgs = Prisma.validator<Prisma.TimeEntryDefaultArgs>()({
  include: {
    employee: { select: { id: true, name: true, cpf: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
  },
});

const MS_PER_HOUR = 1000 * 60 * 60;

interface DerivedTimeEntry {
  status: TimeEntryStatus;
  hoursWorked: number | null;
}

/// Deriva status/horas a partir de entrada e saída — nunca setados à mão
/// pelo cliente. Sem cálculo de hora extra: só a diferença bruta saída-entrada.
function deriveFromCheckInOut(checkIn?: Date, checkOut?: Date): DerivedTimeEntry {
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      return { status: 'INCONSISTENT', hoursWorked: null };
    }
    const hours = (checkOut.getTime() - checkIn.getTime()) / MS_PER_HOUR;
    return { status: 'CLOSED', hoursWorked: Math.round(hours * 100) / 100 };
  }

  if (checkOut && !checkIn) {
    return { status: 'INCONSISTENT', hoursWorked: null };
  }

  return { status: 'OPEN', hoursWorked: null };
}

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateTimeEntryDto) {
    await this.assertEmployee(companyId, dto.employeeId);
    if (dto.constructionSiteId) {
      await this.assertConstructionSite(companyId, dto.constructionSiteId);
    }

    const checkIn = dto.checkIn ? new Date(dto.checkIn) : undefined;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : undefined;
    const derived = deriveFromCheckInOut(checkIn, checkOut);

    const created = await this.prisma.timeEntry.create({
      data: {
        employeeId: dto.employeeId,
        constructionSiteId: dto.constructionSiteId,
        date: new Date(dto.date),
        checkIn,
        checkOut,
        notes: dto.notes,
        status: derived.status,
        hoursWorked: derived.hoursWorked,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryTimeEntryDto,
  ): Promise<PaginatedResult<Prisma.TimeEntryGetPayload<typeof includeArgs>>> {
    const { page, limit, employeeId, constructionSiteId, dateFrom, dateTo } = query;

    const where: Prisma.TimeEntryWhereInput = {
      deletedAt: null,
      employeeId,
      constructionSiteId,
      employee: { companyId },
      date:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        ...includeArgs,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const timeEntry = await this.prisma.timeEntry.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      ...includeArgs,
    });

    if (!timeEntry) {
      throw new NotFoundException('Apontamento de ponto não encontrado.');
    }

    return timeEntry;
  }

  async update(companyId: string, id: string, dto: UpdateTimeEntryDto) {
    const existing = await this.assertExists(companyId, id);

    if (dto.constructionSiteId) {
      await this.assertConstructionSite(companyId, dto.constructionSiteId);
    }

    const nextCheckIn =
      dto.checkIn !== undefined
        ? dto.checkIn
          ? new Date(dto.checkIn)
          : undefined
        : (existing.checkIn ?? undefined);
    const nextCheckOut =
      dto.checkOut !== undefined
        ? dto.checkOut
          ? new Date(dto.checkOut)
          : undefined
        : (existing.checkOut ?? undefined);
    const derived = deriveFromCheckInOut(nextCheckIn, nextCheckOut);

    await this.prisma.timeEntry.update({
      where: { id, employee: { companyId } },
      data: {
        constructionSiteId: dto.constructionSiteId,
        date: dto.date ? new Date(dto.date) : undefined,
        checkIn: nextCheckIn ?? null,
        checkOut: nextCheckOut ?? null,
        notes: dto.notes,
        status: derived.status,
        hoursWorked: derived.hoursWorked,
      },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.timeEntry.update({
      where: { id, employee: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) {
      throw new BadRequestException('Funcionário informado não existe.');
    }
  }

  private async assertConstructionSite(companyId: string, constructionSiteId: string) {
    const constructionSite = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
    });
    if (!constructionSite) {
      throw new BadRequestException('Obra informada não existe.');
    }
  }

  private async assertExists(companyId: string, id: string) {
    const timeEntry = await this.prisma.timeEntry.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
    });
    if (!timeEntry) {
      throw new NotFoundException('Apontamento de ponto não encontrado.');
    }
    return timeEntry;
  }
}
