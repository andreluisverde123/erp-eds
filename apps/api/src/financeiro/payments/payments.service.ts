import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { ApprovalThresholdService } from '../../common/approval/approval-threshold.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPayablesService } from '../account-payables/account-payables.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

const includeArgs = Prisma.validator<Prisma.PaymentDefaultArgs>()({
  include: {
    accountPayable: {
      select: {
        id: true,
        invoice: {
          select: {
            id: true,
            number: true,
            supplier: { select: { id: true, legalName: true, tradeName: true } },
          },
        },
      },
    },
  },
});

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountPayablesService: AccountPayablesService,
    private readonly approvalThreshold: ApprovalThresholdService,
  ) {}

  async create(companyId: string, dto: CreatePaymentDto, permissions: string[] = []) {
    await this.approvalThreshold.assertWithinPaymentThreshold(
      companyId,
      permissions,
      Number(dto.amount),
    );

    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id: dto.accountPayableId, companyId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!accountPayable) {
      throw new BadRequestException('Conta a pagar informada não existe.');
    }
    if (accountPayable.status === 'CANCELLED') {
      throw new BadRequestException('Não é possível registrar pagamento numa conta cancelada.');
    }

    const created = await this.prisma.payment.create({
      data: {
        accountPayableId: accountPayable.id,
        amount: dto.amount,
        paidAt: new Date(dto.paidAt),
        method: dto.method,
        status: dto.status,
      },
    });

    await this.accountPayablesService.recalculateStatus(companyId, accountPayable.id);

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryPaymentDto,
  ): Promise<PaginatedResult<Prisma.PaymentGetPayload<typeof includeArgs>>> {
    const { page, limit, search, status, accountPayableId } = query;

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      status,
      accountPayableId,
      accountPayable: {
        companyId,
        ...(search
          ? {
              OR: [
                { invoice: { number: { contains: search, mode: 'insensitive' } } },
                { invoice: { supplier: { legalName: { contains: search, mode: 'insensitive' } } } },
                { invoice: { supplier: { tradeName: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        ...includeArgs,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null, accountPayable: { companyId } },
      ...includeArgs,
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado.');
    }

    return payment;
  }

  async update(companyId: string, id: string, dto: UpdatePaymentDto) {
    const existing = await this.assertExists(companyId, id);

    await this.prisma.payment.update({
      where: { id, accountPayable: { companyId } },
      data: {
        amount: dto.amount,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        method: dto.method,
        status: dto.status,
      },
    });

    await this.accountPayablesService.recalculateStatus(companyId, existing.accountPayableId);

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.payment.update({
      where: { id, accountPayable: { companyId } },
      data: { deletedAt: new Date() },
    });
    await this.accountPayablesService.recalculateStatus(companyId, existing.accountPayableId);
  }

  private async assertExists(companyId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null, accountPayable: { companyId } },
    });
    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado.');
    }
    return payment;
  }
}
