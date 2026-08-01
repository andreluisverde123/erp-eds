import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type InvoiceStatus } from '../../../generated/prisma/client';
import { addDays } from '../../common/utils/date.util';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const includeArgs = Prisma.validator<Prisma.InvoiceDefaultArgs>()({
  include: {
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    purchaseOrder: { select: { id: true, code: true } },
  },
});

/// Nasce RECEIVED -> pode virar VALIDATED (gera a parcela de contas a pagar)
/// ou CANCELLED. VALIDATED é terminal — a partir daí quem se move é a
/// AccountPayable, não a nota.
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  RECEIVED: ['VALIDATED', 'CANCELLED'],
  VALIDATED: [],
  CANCELLED: [],
};

const DEFAULT_DUE_DAYS = 30;
const DUPLICATE_NUMBER_MESSAGE = 'Já existe uma nota com este número para este fornecedor/série.';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateInvoiceDto) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, companyId, deletedAt: null },
      select: { id: true, supplierId: true, constructionSiteId: true, costCenterId: true },
    });

    if (!purchaseOrder) {
      throw new BadRequestException('Ordem de compra informada não existe.');
    }

    try {
      const created = await this.prisma.invoice.create({
        data: {
          companyId,
          purchaseOrderId: purchaseOrder.id,
          supplierId: purchaseOrder.supplierId,
          constructionSiteId: purchaseOrder.constructionSiteId,
          costCenterId: purchaseOrder.costCenterId,
          number: dto.number,
          series: dto.series,
          issueDate: new Date(dto.issueDate),
          totalAmount: dto.totalAmount,
        },
      });

      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_NUMBER_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryInvoiceDto,
  ): Promise<PaginatedResult<Prisma.InvoiceGetPayload<typeof includeArgs>>> {
    const { page, limit, search, status, supplierId, purchaseOrderId, dateFrom, dateTo } = query;

    const where: Prisma.InvoiceWhereInput = {
      companyId,
      deletedAt: null,
      status,
      supplierId,
      purchaseOrderId,
      issueDate:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
      OR: search
        ? [
            { number: { contains: search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        ...includeArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
    });

    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }

    return invoice;
  }

  async update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'RECEIVED') {
      throw new ConflictException('Só é possível editar notas com status "Recebida".');
    }

    try {
      await this.prisma.invoice.update({
        where: { id, companyId },
        data: {
          number: dto.number,
          series: dto.series,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          totalAmount: dto.totalAmount,
        },
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_NUMBER_MESSAGE);
      }
      throw error;
    }
  }

  async updateStatus(companyId: string, id: string, targetStatus: InvoiceStatus) {
    const existing = await this.assertExists(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Não é possível mudar de "${existing.status}" para "${targetStatus}".`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id, companyId }, data: { status: targetStatus } });

      if (targetStatus === 'VALIDATED') {
        await tx.accountPayable.create({
          data: {
            companyId,
            invoiceId: id,
            amount: existing.totalAmount,
            dueDate: addDays(existing.issueDate, DEFAULT_DUE_DAYS),
          },
        });
      }
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.invoice.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), number: mangleDeletedCode(existing.number, existing.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }
    return invoice;
  }
}
