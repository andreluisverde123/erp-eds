import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type PurchaseRequestStatus } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { ApprovalThresholdService } from '../../common/approval/approval-threshold.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { UpdatePurchaseRequestQuoteDto } from './dto/update-purchase-request-quote.dto';

const listArgs = Prisma.validator<Prisma.PurchaseRequestDefaultArgs>()({
  include: {
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    requestedBy: { select: { id: true, name: true } },
    items: { select: { quantity: true, estimatedUnitPrice: true } },
  },
});

const detailArgs = Prisma.validator<Prisma.PurchaseRequestDefaultArgs>()({
  include: {
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    requestedBy: { select: { id: true, name: true } },
    items: { orderBy: { createdAt: 'asc' } },
  },
});

type ListRow = Prisma.PurchaseRequestGetPayload<typeof listArgs>;

/// Sem aprovação em níveis: cada status só anda pra frente ou vai direto pra
/// CANCELLED. CANCELLED é terminal.
const ALLOWED_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['QUOTING', 'CANCELLED'],
  QUOTING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  CANCELLED: [],
};

/// O que o solicitante faz sozinho, a partir do rascunho: mandar para Compras
/// ou desistir. Ver a checagem em `updateStatus`.
const REQUESTER_TRANSITIONS: PurchaseRequestStatus[] = ['PENDING', 'CANCELLED'];

function calculateEstimatedTotal(
  items: { quantity: Prisma.Decimal; estimatedUnitPrice: Prisma.Decimal | null }[],
) {
  return items.reduce((sum, item) => {
    const unitPrice = item.estimatedUnitPrice ? Number(item.estimatedUnitPrice) : 0;
    return sum + Number(item.quantity) * unitPrice;
  }, 0);
}

function withEstimatedTotal<
  T extends { items: { quantity: Prisma.Decimal; estimatedUnitPrice: Prisma.Decimal | null }[] },
>(row: T) {
  return { ...row, estimatedTotal: calculateEstimatedTotal(row.items) };
}

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalThreshold: ApprovalThresholdService,
  ) {}

  async create(companyId: string, userId: string, dto: CreatePurchaseRequestDto) {
    const constructionSiteId = await this.resolveConstructionSiteId(companyId, dto.costCenterId);

    const code = await nextSequentialCode(
      () => this.prisma.purchaseRequest.count({ where: { companyId } }),
      'SOL',
    );

    const created = await this.prisma.purchaseRequest.create({
      data: {
        companyId,
        constructionSiteId,
        costCenterId: dto.costCenterId,
        requestedById: userId,
        code,
        notes: dto.notes,
        items: { create: dto.items.map((item) => ({ ...item })) },
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryPurchaseRequestDto,
  ): Promise<PaginatedResult<ListRow & { estimatedTotal: number }>> {
    const { page, limit, search, status, constructionSiteId, costCenterId, dateFrom, dateTo } =
      query;

    const where: Prisma.PurchaseRequestWhereInput = {
      companyId,
      deletedAt: null,
      status,
      constructionSiteId,
      costCenterId,
      createdAt:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
      // O centro de custo é o destino da solicitação (obra, escritório,
      // fazenda...), então ele entra na busca por texto junto com o código.
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { costCenter: { name: { contains: search, mode: 'insensitive' } } },
            { constructionSite: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        ...listArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return paginate(rows.map(withEstimatedTotal), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    const history = await this.prisma.auditLog.findMany({
      where: { companyId, entityType: 'PurchaseRequest', entityId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { ...withEstimatedTotal(request), history };
  }

  async update(companyId: string, id: string, dto: UpdatePurchaseRequestDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'DRAFT') {
      throw new ConflictException('Só é possível editar solicitações em rascunho.');
    }

    // Trocar o centro de custo troca junto a obra derivada — inclusive para
    // nulo, quando o novo destino não é uma obra.
    const constructionSiteId = dto.costCenterId
      ? await this.resolveConstructionSiteId(companyId, dto.costCenterId)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequest.update({
        where: { id, companyId },
        data: {
          constructionSiteId,
          costCenterId: dto.costCenterId,
          notes: dto.notes,
        },
      });

      if (dto.items) {
        await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } });
        await tx.purchaseRequestItem.createMany({
          data: dto.items.map((item) => ({ ...item, purchaseRequestId: id })),
        });
      }
    });

    return this.findOne(companyId, id);
  }

  /// Cotação pelo setor de Compras. Existe porque o valor unitário saiu do
  /// formulário de solicitação (quem pede não conhece o preço) — sem um lugar
  /// para informá-lo depois, toda solicitação valeria zero e a alçada de
  /// aprovação por valor deixaria de valer.
  ///
  /// Só roda em PENDING e QUOTING: em DRAFT a solicitação ainda é do
  /// solicitante (que edita pela tela normal), e depois de aprovada o valor
  /// que vale é o negociado na ordem de compra.
  async updateQuote(companyId: string, id: string, dto: UpdatePurchaseRequestQuoteDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'PENDING' && existing.status !== 'QUOTING') {
      throw new ConflictException(
        'Só é possível cotar solicitações aguardando aprovação ou em cotação.',
      );
    }

    const items = await this.prisma.purchaseRequestItem.findMany({
      where: { purchaseRequestId: id },
      select: { id: true },
    });
    const knownItemIds = new Set(items.map((item) => item.id));

    if (dto.items.some((item) => !knownItemIds.has(item.id))) {
      throw new BadRequestException('Um dos itens informados não pertence a esta solicitação.');
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.purchaseRequestItem.update({
          where: { id: item.id },
          data: { estimatedUnitPrice: item.estimatedUnitPrice },
        }),
      ),
    );

    return this.findOne(companyId, id);
  }

  async updateStatus(
    companyId: string,
    id: string,
    targetStatus: PurchaseRequestStatus,
    permissions: string[] = [],
  ) {
    const existing = await this.assertExists(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Não é possível mudar de "${existing.status}" para "${targetStatus}".`,
      );
    }

    // Quem só tem `compras.request` (Engenharia) abre a solicitação e a manda
    // para Compras — e pode desistir enquanto ela ainda é rascunho. A partir
    // daí o processo é do setor de Compras: marcar em cotação, aprovar e
    // cancelar um pedido já enviado exigem `compras.manage`.
    if (!permissions.includes('compras.manage')) {
      const isRequesterTransition =
        existing.status === 'DRAFT' && REQUESTER_TRANSITIONS.includes(targetStatus);

      if (!isRequesterTransition) {
        throw new ForbiddenException(
          'Esta mudança de status é do setor de Compras. Você pode enviar ou cancelar a solicitação enquanto ela é um rascunho.',
        );
      }
    }

    // Alçada: só APROVAR é controlado por valor. Rascunho, envio e
    // cancelamento continuam livres para quem tem `compras.manage`.
    if (targetStatus === 'APPROVED') {
      const items = await this.prisma.purchaseRequestItem.findMany({
        where: { purchaseRequestId: id },
        select: { quantity: true, estimatedUnitPrice: true },
      });
      await this.approvalThreshold.assertWithinPurchaseThreshold(
        companyId,
        permissions,
        calculateEstimatedTotal(items),
      );
    }

    await this.prisma.purchaseRequest.update({
      where: { id, companyId },
      data: { status: targetStatus },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.purchaseRequest.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), code: mangleDeletedCode(existing.code, existing.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return request;
  }

  /// O solicitante escolhe só o centro de custo — ele é o destino da compra.
  /// A obra deixou de ser um campo do formulário e passou a ser deduzida daqui:
  /// centro de custo de obra devolve a obra; Escritório, Fazenda e afins
  /// devolvem `null`, e a solicitação simplesmente não tem obra vinculada.
  private async resolveConstructionSiteId(
    companyId: string,
    costCenterId: string,
  ): Promise<string | null> {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, companyId, deletedAt: null },
      select: { constructionSiteId: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    return costCenter.constructionSiteId;
  }
}
