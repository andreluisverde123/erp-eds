import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { QueryContractorDto } from './dto/query-contractor.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

const DUPLICATE_DOCUMENT_MESSAGE = 'Já existe uma empresa terceirizada com este CNPJ/CPF.';

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateContractorDto) {
    try {
      return await this.prisma.contractor.create({ data: { companyId, ...dto } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_DOCUMENT_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryContractorDto,
  ): Promise<PaginatedResult<Prisma.ContractorGetPayload<object>>> {
    const { page, limit, search, status, city } = query;

    const where: Prisma.ContractorWhereInput = {
      companyId,
      deletedAt: null,
      status,
      city: city ? { equals: city, mode: 'insensitive' } : undefined,
      OR: search
        ? [
            { legalName: { contains: search, mode: 'insensitive' } },
            { tradeName: { contains: search, mode: 'insensitive' } },
            { document: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contractor.findMany({
        where,
        orderBy: { legalName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractor.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const contractor = await this.prisma.contractor.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!contractor) {
      throw new NotFoundException('Empresa terceirizada não encontrada.');
    }
    return contractor;
  }

  async update(companyId: string, id: string, dto: UpdateContractorDto) {
    await this.findOne(companyId, id);

    try {
      return await this.prisma.contractor.update({ where: { id, companyId }, data: dto });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_DOCUMENT_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const contractor = await this.findOne(companyId, id);
    await this.prisma.contractor.update({
      where: { id, companyId },
      data: {
        deletedAt: new Date(),
        document: mangleDeletedCode(contractor.document, contractor.id),
      },
    });
  }
}
