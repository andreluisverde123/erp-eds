import { Injectable } from '@nestjs/common';

import { addDays, startOfDay } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';

const CONTRACT_EXPIRING_WINDOW_DAYS = 30;

export interface ExecutiveSummary {
  activeConstructionSites: number;
  monthlyPurchases: { count: number; totalAmount: number };
  accountsPayable: { count: number; totalOpen: number };
  activeEmployees: number;
  activeContractors: number;
  expiringContracts: number;
}

/// Cards da Home Executiva — cada um é uma consulta agregada independente
/// (count/sum), sem tocar nos services dos módulos de domínio. Roda em
/// paralelo via Promise.all para manter a Home rápida mesmo somando 6
/// indicadores de tabelas diferentes.
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(companyId: string): Promise<ExecutiveSummary> {
    const today = startOfDay(new Date());
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const expiringWindowEnd = addDays(today, CONTRACT_EXPIRING_WINDOW_DAYS);

    const [
      activeConstructionSites,
      monthlyPurchasesAggregate,
      openAccountPayables,
      activeEmployees,
      activeContractors,
      expiringContracts,
    ] = await Promise.all([
      this.prisma.constructionSite.count({
        where: { companyId, deletedAt: null, status: 'IN_PROGRESS' },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: { not: 'CANCELLED' },
          issueDate: { gte: monthStart, lte: monthEnd },
        },
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.accountPayable.findMany({
        where: { companyId, deletedAt: null, status: { in: ['OPEN', 'PARTIAL'] } },
        include: { payments: { where: { deletedAt: null, status: 'PAID' } } },
      }),
      this.prisma.employee.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.contractor.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.contractorContract.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          endDate: { gte: today, lte: expiringWindowEnd },
        },
      }),
    ]);

    const totalOpen = openAccountPayables.reduce((sum, account) => {
      const paid = account.payments.reduce(
        (paidSum, payment) => paidSum + Number(payment.amount),
        0,
      );
      return sum + (Number(account.amount) - paid);
    }, 0);

    return {
      activeConstructionSites,
      monthlyPurchases: {
        count: monthlyPurchasesAggregate._count,
        totalAmount: Number(monthlyPurchasesAggregate._sum.totalAmount ?? 0),
      },
      accountsPayable: { count: openAccountPayables.length, totalOpen },
      activeEmployees,
      activeContractors,
      expiringContracts,
    };
  }
}
