import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConstructionSiteDto } from './dto/create-construction-site.dto';
import { QueryConstructionSiteDto } from './dto/query-construction-site.dto';
import { UpdateConstructionSiteDto } from './dto/update-construction-site.dto';

const listArgs = Prisma.validator<Prisma.ConstructionSiteDefaultArgs>()({
  include: { _count: { select: { costCenters: { where: { deletedAt: null } } } } },
});

const detailArgs = Prisma.validator<Prisma.ConstructionSiteDefaultArgs>()({
  include: {
    costCenters: { where: { deletedAt: null }, orderBy: { code: 'asc' } },
    _count: { select: { costCenters: { where: { deletedAt: null } } } },
  },
});

export type ConstructionSiteListItem = Prisma.ConstructionSiteGetPayload<typeof listArgs>;
export type ConstructionSiteDetail = Prisma.ConstructionSiteGetPayload<typeof detailArgs>;

const DUPLICATE_CODE_MESSAGE = 'Já existe uma obra com este código.';

@Injectable()
export class ConstructionSitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateConstructionSiteDto): Promise<ConstructionSiteDetail> {
    try {
      const created = await this.prisma.constructionSite.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          clientName: dto.clientName,
          city: dto.city,
          state: dto.state,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
          status: dto.status,
          responsibleName: dto.responsibleName,
          description: dto.description,
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
    query: QueryConstructionSiteDto,
  ): Promise<PaginatedResult<ConstructionSiteListItem>> {
    const { page, limit, search, status, city } = query;

    const where: Prisma.ConstructionSiteWhereInput = {
      companyId,
      deletedAt: null,
      status,
      city: city ? { equals: city, mode: 'insensitive' } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { clientName: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.constructionSite.findMany({
        where,
        ...listArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.constructionSite.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string): Promise<ConstructionSiteDetail> {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!site) {
      throw new NotFoundException('Obra não encontrada.');
    }

    return site;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateConstructionSiteDto,
  ): Promise<ConstructionSiteDetail> {
    await this.findOne(companyId, id);

    try {
      await this.prisma.constructionSite.update({
        where: { id, companyId },
        data: {
          code: dto.code,
          name: dto.name,
          clientName: dto.clientName,
          city: dto.city,
          state: dto.state,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
          status: dto.status,
          responsibleName: dto.responsibleName,
          description: dto.description,
        },
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const site = await this.findOne(companyId, id);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.constructionSite.update({
        where: { id, companyId },
        data: { deletedAt: now, code: mangleDeletedCode(site.code, site.id) },
      }),
      ...site.costCenters.map((costCenter) =>
        this.prisma.costCenter.update({
          where: { id: costCenter.id },
          data: { deletedAt: now, code: mangleDeletedCode(costCenter.code, costCenter.id) },
        }),
      ),
    ]);
  }
}
