import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const includeArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
  include: {
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    purchaseRequest: { select: { id: true, code: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
  },
});

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreatePurchaseOrderDto) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id: dto.purchaseRequestId, companyId, deletedAt: null },
      select: { id: true, status: true, constructionSiteId: true, costCenterId: true },
    });

    if (!request) {
      throw new BadRequestException('Solicitação informada não existe.');
    }
    if (request.status !== 'APPROVED') {
      throw new BadRequestException(
        'Só é possível gerar ordem de compra a partir de uma solicitação aprovada.',
      );
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) {
      throw new BadRequestException('Fornecedor informado não existe.');
    }

    const code = await nextSequentialCode(
      () => this.prisma.purchaseOrder.count({ where: { companyId } }),
      'OC',
    );

    const created = await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        purchaseRequestId: request.id,
        supplierId: dto.supplierId,
        constructionSiteId: request.constructionSiteId,
        costCenterId: request.costCenterId,
        code,
        totalAmount: dto.totalAmount,
        issueDate: new Date(dto.issueDate),
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : undefined,
        status: dto.status,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryPurchaseOrderDto,
  ): Promise<PaginatedResult<Prisma.PurchaseOrderGetPayload<typeof includeArgs>>> {
    const { page, limit, search, status, supplierId, purchaseRequestId } = query;

    const where: Prisma.PurchaseOrderWhereInput = {
      companyId,
      deletedAt: null,
      status,
      supplierId,
      purchaseRequestId,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        ...includeArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
    });

    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }

    return order;
  }

  async update(companyId: string, id: string, dto: UpdatePurchaseOrderDto) {
    await this.assertExists(companyId, id);

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('Fornecedor informado não existe.');
      }
    }

    await this.prisma.purchaseOrder.update({
      where: { id, companyId },
      data: {
        supplierId: dto.supplierId,
        totalAmount: dto.totalAmount,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : undefined,
        status: dto.status,
      },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.purchaseOrder.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), code: mangleDeletedCode(existing.code, existing.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }
    return order;
  }
}
