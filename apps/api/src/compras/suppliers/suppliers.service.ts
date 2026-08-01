import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const DUPLICATE_DOCUMENT_MESSAGE = 'Já existe um fornecedor com este CNPJ.';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateSupplierDto) {
    try {
      return await this.prisma.supplier.create({ data: { companyId, ...dto } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_DOCUMENT_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QuerySupplierDto,
  ): Promise<PaginatedResult<Prisma.SupplierGetPayload<object>>> {
    const { page, limit, search } = query;

    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
      OR: search
        ? [
            { legalName: { contains: search, mode: 'insensitive' } },
            { tradeName: { contains: search, mode: 'insensitive' } },
            { document: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return supplier;
  }

  async update(companyId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(companyId, id);

    try {
      return await this.prisma.supplier.update({ where: { id, companyId }, data: dto });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_DOCUMENT_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const supplier = await this.findOne(companyId, id);
    await this.prisma.supplier.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), document: mangleDeletedCode(supplier.document, supplier.id) },
    });
  }
}
