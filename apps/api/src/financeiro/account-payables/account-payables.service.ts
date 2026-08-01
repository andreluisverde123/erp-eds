import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type AccountPayableStatus } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { addDays, isSameDay, startOfDay } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountPayableDto } from './dto/create-account-payable.dto';
import { QueryAccountPayableDto } from './dto/query-account-payable.dto';
import { UpdateAccountPayableDto } from './dto/update-account-payable.dto';

const includeArgs = Prisma.validator<Prisma.AccountPayableDefaultArgs>()({
  include: {
    invoice: {
      select: {
        id: true,
        number: true,
        series: true,
        supplier: { select: { id: true, legalName: true, tradeName: true } },
      },
    },
  },
});

export interface AccountPayableSummary {
  totalOpen: number;
  totalPaid: number;
  dueToday: number;
  dueThisWeek: number;
}

@Injectable()
export class AccountPayablesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateAccountPayableDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!invoice) {
      throw new BadRequestException('Nota fiscal informada não existe.');
    }

    const created = await this.prisma.accountPayable.create({
      data: {
        companyId,
        invoiceId: invoice.id,
        dueDate: new Date(dto.dueDate),
        amount: dto.amount,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryAccountPayableDto,
  ): Promise<PaginatedResult<Prisma.AccountPayableGetPayload<typeof includeArgs>>> {
    const { page, limit, search, status, supplierId, dueDateFrom, dueDateTo } = query;

    const where: Prisma.AccountPayableWhereInput = {
      companyId,
      deletedAt: null,
      status,
      dueDate:
        dueDateFrom || dueDateTo
          ? {
              gte: dueDateFrom ? new Date(dueDateFrom) : undefined,
              lte: dueDateTo ? new Date(dueDateTo) : undefined,
            }
          : undefined,
      invoice:
        supplierId || search
          ? {
              supplierId,
              OR: search
                ? [
                    { number: { contains: search, mode: 'insensitive' } },
                    { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
                    { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
                  ]
                : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.accountPayable.findMany({
        where,
        ...includeArgs,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountPayable.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
      include: {
        ...includeArgs.include,
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
      },
    });

    if (!accountPayable) {
      throw new NotFoundException('Conta a pagar não encontrada.');
    }

    return accountPayable;
  }

  async update(companyId: string, id: string, dto: UpdateAccountPayableDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'OPEN') {
      throw new ConflictException(
        'Só é possível editar contas em aberto (sem pagamentos registrados).',
      );
    }

    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        amount: dto.amount,
      },
    });

    return this.findOne(companyId, id);
  }

  async updateStatus(companyId: string, id: string, targetStatus: AccountPayableStatus) {
    const existing = await this.assertExists(companyId, id);

    if (targetStatus !== 'CANCELLED' || existing.status !== 'OPEN') {
      throw new BadRequestException(
        `Não é possível mudar de "${existing.status}" para "${targetStatus}".`,
      );
    }

    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: { status: 'CANCELLED' },
    });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  /// Reconcilia o status da parcela a partir da soma dos pagamentos PAID
  /// vinculados a ela. Chamado pelo PaymentsService sempre que um pagamento
  /// é criado, editado ou removido — nunca setado à mão via API.
  async recalculateStatus(companyId: string, accountPayableId: string): Promise<void> {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id: accountPayableId, companyId, deletedAt: null },
      include: { payments: { where: { deletedAt: null, status: 'PAID' } } },
    });

    if (!accountPayable || accountPayable.status === 'CANCELLED') return;

    const paidSum = accountPayable.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const total = Number(accountPayable.amount);

    const status: AccountPayableStatus =
      paidSum <= 0 ? 'OPEN' : paidSum >= total ? 'PAID' : 'PARTIAL';

    if (status !== accountPayable.status) {
      await this.prisma.accountPayable.update({
        where: { id: accountPayableId },
        data: { status },
      });
    }
  }

  async getSummary(companyId: string): Promise<AccountPayableSummary> {
    const openAccounts = await this.prisma.accountPayable.findMany({
      where: { companyId, deletedAt: null, status: { in: ['OPEN', 'PARTIAL'] } },
      include: { payments: { where: { deletedAt: null, status: 'PAID' } } },
    });

    const today = startOfDay(new Date());
    const weekFromNow = addDays(today, 7);

    let totalOpen = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const account of openAccounts) {
      const paid = account.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const remaining = Number(account.amount) - paid;
      totalOpen += remaining;

      const dueDate = startOfDay(account.dueDate);
      if (isSameDay(dueDate, today)) dueToday += remaining;
      if (dueDate >= today && dueDate <= weekFromNow) dueThisWeek += remaining;
    }

    const paidAggregate = await this.prisma.accountPayable.aggregate({
      where: { companyId, deletedAt: null, status: 'PAID' },
      _sum: { amount: true },
    });

    return {
      totalOpen,
      totalPaid: Number(paidAggregate._sum.amount ?? 0),
      dueToday,
      dueThisWeek,
    };
  }

  private async assertExists(companyId: string, id: string) {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!accountPayable) {
      throw new NotFoundException('Conta a pagar não encontrada.');
    }
    return accountPayable;
  }
}
