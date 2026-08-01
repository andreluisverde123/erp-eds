import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { addDays, startOfDay } from '../../common/utils/date.util';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computeContractBadge,
  computeDaysRemaining,
  EXPIRING_WINDOW_DAYS,
} from './contract-status.util';
import { CreateContractDto } from './dto/create-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

const DUPLICATE_CODE_MESSAGE = 'Já existe um contrato com este número.';

const includeArgs = Prisma.validator<Prisma.ContractorContractDefaultArgs>()({
  include: {
    contractor: { select: { id: true, legalName: true, tradeName: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
  },
});

type ContractWithRelations = Prisma.ContractorContractGetPayload<typeof includeArgs>;

function withComputedStatus(contract: ContractWithRelations) {
  return {
    ...contract,
    badgeStatus: computeContractBadge(contract.status, contract.endDate),
    daysRemaining: computeDaysRemaining(contract.endDate),
  };
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateContractDto) {
    await this.assertContractor(companyId, dto.contractorId);
    await this.assertConstructionSite(companyId, dto.constructionSiteId);
    this.assertDateRange(dto.startDate, dto.endDate);

    const code = await nextSequentialCode(
      () => this.prisma.contractorContract.count({ where: { companyId } }),
      'CT',
    );

    try {
      const created = await this.prisma.contractorContract.create({
        data: {
          companyId,
          contractorId: dto.contractorId,
          constructionSiteId: dto.constructionSiteId,
          code,
          scope: dto.scope,
          totalValue: dto.totalValue,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
        },
      });
      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryContractDto,
  ): Promise<PaginatedResult<ReturnType<typeof withComputedStatus>>> {
    const { page, limit, search, contractorId, constructionSiteId, badgeStatus } = query;
    const today = startOfDay(new Date());

    const where: Prisma.ContractorContractWhereInput = {
      companyId,
      deletedAt: null,
      contractorId,
      constructionSiteId,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { contractor: { legalName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    if (badgeStatus === 'CANCELLED') {
      where.status = 'CANCELLED';
    } else if (badgeStatus === 'EXPIRED') {
      where.status = 'ACTIVE';
      where.endDate = { lt: today };
    } else if (badgeStatus === 'EXPIRING') {
      where.status = 'ACTIVE';
      where.endDate = { gte: today, lte: addDays(today, EXPIRING_WINDOW_DAYS) };
    } else if (badgeStatus === 'ACTIVE') {
      where.status = 'ACTIVE';
      where.endDate = { gt: addDays(today, EXPIRING_WINDOW_DAYS) };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contractorContract.findMany({
        where,
        ...includeArgs,
        orderBy: { endDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractorContract.count({ where }),
    ]);

    return paginate(data.map(withComputedStatus), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const contract = await this.prisma.contractorContract.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return withComputedStatus(contract);
  }

  async update(companyId: string, id: string, dto: UpdateContractDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status === 'CANCELLED') {
      throw new ConflictException('Não é possível editar um contrato encerrado.');
    }

    if (dto.constructionSiteId) {
      await this.assertConstructionSite(companyId, dto.constructionSiteId);
    }

    const startDate = dto.startDate ?? existing.startDate.toISOString();
    const endDate = dto.endDate ?? existing.endDate.toISOString();
    this.assertDateRange(startDate, endDate);

    await this.prisma.contractorContract.update({
      where: { id, companyId },
      data: {
        constructionSiteId: dto.constructionSiteId,
        scope: dto.scope,
        totalValue: dto.totalValue,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    return this.findOne(companyId, id);
  }

  async updateStatus(companyId: string, id: string, status: 'CANCELLED') {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Só é possível encerrar um contrato vigente.');
    }

    await this.prisma.contractorContract.update({ where: { id, companyId }, data: { status } });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.contractorContract.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  /// Alimenta o card de alerta na Home — contratos vigentes vencendo nos
  /// próximos 30 dias.
  async getExpiringSummary(companyId: string) {
    const today = startOfDay(new Date());
    const windowEnd = addDays(today, EXPIRING_WINDOW_DAYS);

    const where: Prisma.ContractorContractWhereInput = {
      companyId,
      deletedAt: null,
      status: 'ACTIVE',
      endDate: { gte: today, lte: windowEnd },
    };

    const [count, contracts] = await this.prisma.$transaction([
      this.prisma.contractorContract.count({ where }),
      this.prisma.contractorContract.findMany({
        where,
        ...includeArgs,
        orderBy: { endDate: 'asc' },
        take: 5,
      }),
    ]);

    return {
      count,
      contracts: contracts.map((contract) => ({
        id: contract.id,
        code: contract.code,
        contractorName: contract.contractor.tradeName ?? contract.contractor.legalName,
        endDate: contract.endDate,
        daysRemaining: computeDaysRemaining(contract.endDate, today),
      })),
    };
  }

  private async assertContractor(companyId: string, contractorId: string) {
    const contractor = await this.prisma.contractor.findFirst({
      where: { id: contractorId, companyId, deletedAt: null },
    });
    if (!contractor) {
      throw new BadRequestException('Empresa terceirizada informada não existe.');
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

  private assertDateRange(startDate: string, endDate: string) {
    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('A data de fim não pode ser anterior à data de início.');
    }
  }

  private async assertExists(companyId: string, id: string) {
    const contract = await this.prisma.contractorContract.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return contract;
  }
}
