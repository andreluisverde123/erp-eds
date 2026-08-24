import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { onlyDigits } from '../../common/utils/document.util';
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
      return await this.prisma.supplier.create({
        // `document` normalizado na entrada: a unique `(companyId, document)`
        // é sobre o texto, e o mesmo CNPJ digitado com e sem máscara passaria
        // por ela como dois fornecedores diferentes. Também é o que faz o
        // cadastro manual casar com o emitente da NF-e, que chega só com
        // dígitos. Ver `common/utils/document.util.ts`.
        data: { companyId, ...dto, document: onlyDigits(dto.document) },
      });
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
            // Guardamos só dígitos; quem busca costuma digitar com máscara.
            // Sem isto, procurar "12.345.678" deixaria de achar o fornecedor
            // que a normalização gravou como "12345678000190".
            { document: { contains: onlyDigits(search) || search, mode: 'insensitive' } },
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
      return await this.prisma.supplier.update({
        where: { id, companyId },
        // Mesma normalização do cadastro — editar não pode reintroduzir a
        // máscara que a criação removeu.
        data: { ...dto, ...(dto.document ? { document: onlyDigits(dto.document) } : {}) },
      });
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
