import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  computeContractBadge,
  type ContractBadge,
} from '../../terceiros/contracts/contract-status.util';
import {
  bucketByDay,
  bucketByMonth,
  daysAgoStart,
  monthsWindow,
  type ChartPoint,
} from './time-series.util';

const SITE_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planejamento',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Em Aberto',
  PARTIAL: 'Parcial',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const CONTRACT_BADGE_LABEL: Record<ContractBadge, string> = {
  ACTIVE: 'Vigente',
  EXPIRING: 'Vencendo',
  EXPIRED: 'Vencido',
  CANCELLED: 'Encerrado',
};

/// Cada indicador é uma consulta agregada isolada — sem depender dos
/// services dos módulos de domínio (só do PrismaService, global). Dataset
/// desta etapa do produto é pequeno o bastante pra agregação em JS (depois
/// de um `groupBy`/`findMany` enxuto) ser mais simples e portável entre
/// bancos do que SQL cru — ver nota de performance no resumo final.
@Injectable()
export class IndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getComprasIndicators(companyId: string) {
    const [bySite, bySupplier, byPeriod, aggregate] = await Promise.all([
      this.purchasesBySite(companyId),
      this.purchasesBySupplier(companyId),
      this.purchasesByPeriod(companyId),
      this.prisma.purchaseOrder.aggregate({
        where: { companyId, deletedAt: null },
        _avg: { totalAmount: true },
        _count: true,
      }),
    ]);

    return {
      bySite,
      bySupplier,
      byPeriod,
      averageValue: Number(aggregate._avg.totalAmount ?? 0),
      totalOrders: aggregate._count,
    };
  }

  async getFinanceiroIndicators(companyId: string) {
    const [paidVsOpen, cashFlow, expensesBySite] = await Promise.all([
      this.paidVsOpenAccounts(companyId),
      this.cashFlowSeries(companyId),
      this.expensesBySite(companyId),
    ]);

    return { paidVsOpen, cashFlow, expensesBySite };
  }

  async getEngenhariaIndicators(companyId: string) {
    const [sitesByStatus, sitesProgress, topCostCenters] = await Promise.all([
      this.sitesByStatus(companyId),
      this.sitesProgress(companyId),
      this.topCostCenters(companyId),
    ]);

    return { sitesByStatus, sitesProgress, topCostCenters };
  }

  async getRhIndicators(companyId: string) {
    const [employeesBySite, dailyProduction, hoursWorked] = await Promise.all([
      this.employeesBySite(companyId),
      this.dailyProductionSeries(companyId),
      this.hoursWorkedSeries(companyId),
    ]);

    return { employeesBySite, dailyProduction, hoursWorked };
  }

  async getTerceirosIndicators(companyId: string) {
    const [contractsByBadge, activeContractors, totalContractors] = await Promise.all([
      this.contractsByBadge(companyId),
      this.prisma.contractor.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.contractor.count({ where: { companyId, deletedAt: null } }),
    ]);

    return { contractsByBadge, activeContractors, totalContractors };
  }

  // --- Compras -------------------------------------------------------

  private async purchasesBySite(companyId: string): Promise<ChartPoint[]> {
    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['constructionSiteId'],
      where: { companyId, deletedAt: null },
      _sum: { totalAmount: true },
      _count: true,
    });
    const siteIds = grouped
      .map((g) => g.constructionSiteId)
      .filter((id): id is string => id !== null);
    const sites = await this.prisma.constructionSite.findMany({
      where: { id: { in: siteIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(sites.map((site) => [site.id, site.name]));

    // Ordens sem obra existem desde que o centro de custo virou o destino da
    // compra (Escritório, Fazenda...) — viram uma fatia própria em vez de sumir.
    return grouped
      .map((g) => ({
        label:
          g.constructionSiteId === null
            ? 'Sem obra vinculada'
            : (nameById.get(g.constructionSiteId) ?? 'Obra removida'),
        value: Number(g._sum.totalAmount ?? 0),
        count: g._count,
      }))
      .sort((a, b) => b.value - a.value);
  }

  private async purchasesBySupplier(companyId: string): Promise<ChartPoint[]> {
    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { companyId, deletedAt: null },
      _sum: { totalAmount: true },
      _count: true,
    });
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: grouped.map((g) => g.supplierId) } },
      select: { id: true, legalName: true, tradeName: true },
    });
    const nameById = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.tradeName ?? supplier.legalName]),
    );

    return grouped
      .map((g) => ({
        label: nameById.get(g.supplierId) ?? 'Fornecedor removido',
        value: Number(g._sum.totalAmount ?? 0),
        count: g._count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  private async purchasesByPeriod(companyId: string): Promise<ChartPoint[]> {
    const { start } = monthsWindow(5);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, deletedAt: null, issueDate: { gte: start } },
      select: { issueDate: true, totalAmount: true },
    });
    return bucketByMonth(
      orders,
      (order) => order.issueDate,
      (order) => Number(order.totalAmount),
    );
  }

  // --- Financeiro ------------------------------------------------------

  private async paidVsOpenAccounts(companyId: string): Promise<ChartPoint[]> {
    const grouped = await this.prisma.accountPayable.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _sum: { amount: true },
      _count: true,
    });

    return grouped.map((g) => ({
      label: ACCOUNT_STATUS_LABEL[g.status] ?? g.status,
      value: Number(g._sum.amount ?? 0),
      count: g._count,
    }));
  }

  private async cashFlowSeries(companyId: string): Promise<ChartPoint[]> {
    const { start } = monthsWindow(5);
    const payments = await this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        status: 'PAID',
        paidAt: { gte: start },
        accountPayable: { companyId },
      },
      select: { paidAt: true, amount: true },
    });
    return bucketByMonth(
      payments,
      (payment) => payment.paidAt,
      (payment) => Number(payment.amount),
    );
  }

  private async expensesBySite(companyId: string): Promise<ChartPoint[]> {
    const accounts = await this.prisma.accountPayable.findMany({
      where: { companyId, deletedAt: null },
      select: {
        amount: true,
        // A obra sai da própria conta. Ia por `invoice.constructionSite`, e
        // com contas sem nota isso deixaria a despesa avulsa fora do gráfico
        // — a conta é justamente o lugar onde a obra agora está.
        constructionSite: { select: { name: true } },
      },
    });

    const totals = new Map<string, number>();
    for (const account of accounts) {
      const siteName = account.constructionSite?.name ?? 'Sem obra vinculada';
      totals.set(siteName, (totals.get(siteName) ?? 0) + Number(account.amount));
    }

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  // --- Engenharia --------------------------------------------------------

  private async sitesByStatus(companyId: string): Promise<ChartPoint[]> {
    const grouped = await this.prisma.constructionSite.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: true,
    });

    return grouped.map((g) => ({
      label: SITE_STATUS_LABEL[g.status] ?? g.status,
      value: g._count,
    }));
  }

  /// "Evolução das obras" — sem campo de progresso físico no schema, então
  /// isto é uma estimativa por cronograma (tempo decorrido entre início e
  /// previsão de fim), não medição real de execução. Ver evoluções futuras.
  private async sitesProgress(companyId: string): Promise<ChartPoint[]> {
    const sites = await this.prisma.constructionSite.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'IN_PROGRESS',
        startDate: { not: null },
        expectedEndDate: { not: null },
      },
      select: { name: true, startDate: true, expectedEndDate: true },
    });

    const now = Date.now();
    return sites
      .map((site) => {
        const start = site.startDate!.getTime();
        const end = site.expectedEndDate!.getTime();
        const ratio = end > start ? (now - start) / (end - start) : 0;
        return { label: site.name, value: Math.round(Math.min(100, Math.max(0, ratio * 100))) };
      })
      .sort((a, b) => b.value - a.value);
  }

  private async topCostCenters(companyId: string): Promise<ChartPoint[]> {
    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['costCenterId'],
      where: { companyId, deletedAt: null },
      _count: true,
    });
    const costCenters = await this.prisma.costCenter.findMany({
      where: { id: { in: grouped.map((g) => g.costCenterId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(costCenters.map((cc) => [cc.id, cc.name]));

    return grouped
      .map((g) => ({
        label: nameById.get(g.costCenterId) ?? 'Centro de custo removido',
        value: g._count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  // --- RH ------------------------------------------------------------

  private async employeesBySite(companyId: string): Promise<ChartPoint[]> {
    const today = daysAgoStart(0);
    const allocations = await this.prisma.employeeAllocation.findMany({
      where: {
        deletedAt: null,
        OR: [{ endDate: null }, { endDate: { gte: today } }],
        employee: { companyId, deletedAt: null, status: 'ACTIVE' },
      },
      select: { employeeId: true, startDate: true, constructionSite: { select: { name: true } } },
      orderBy: { startDate: 'desc' },
    });

    // Um funcionário pode ter mais de uma alocação "ativa" candidata — fica
    // só a mais recente por funcionário (mesma regra de "obra atual" do RH).
    const currentSiteByEmployee = new Map<string, string>();
    for (const allocation of allocations) {
      if (!currentSiteByEmployee.has(allocation.employeeId)) {
        currentSiteByEmployee.set(allocation.employeeId, allocation.constructionSite.name);
      }
    }

    const totals = new Map<string, number>();
    for (const siteName of currentSiteByEmployee.values()) {
      totals.set(siteName, (totals.get(siteName) ?? 0) + 1);
    }

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  private async dailyProductionSeries(companyId: string): Promise<ChartPoint[]> {
    const start = daysAgoStart(29);
    const entries = await this.prisma.productionEntry.findMany({
      where: { deletedAt: null, date: { gte: start }, employee: { companyId } },
      select: { date: true },
    });
    return bucketByDay(
      entries,
      (entry) => entry.date,
      () => 1,
      29,
    );
  }

  private async hoursWorkedSeries(companyId: string): Promise<ChartPoint[]> {
    const start = daysAgoStart(29);
    const entries = await this.prisma.timeEntry.findMany({
      where: { deletedAt: null, status: 'CLOSED', date: { gte: start }, employee: { companyId } },
      select: { date: true, hoursWorked: true },
    });
    return bucketByDay(
      entries,
      (entry) => entry.date,
      (entry) => Number(entry.hoursWorked ?? 0),
      29,
    );
  }

  // --- Terceiros -----------------------------------------------------

  private async contractsByBadge(companyId: string): Promise<ChartPoint[]> {
    const contracts = await this.prisma.contractorContract.findMany({
      where: { companyId, deletedAt: null },
      select: { status: true, endDate: true },
    });

    const counts: Record<ContractBadge, number> = {
      ACTIVE: 0,
      EXPIRING: 0,
      EXPIRED: 0,
      CANCELLED: 0,
    };
    for (const contract of contracts) {
      counts[computeContractBadge(contract.status, contract.endDate)] += 1;
    }

    return (Object.keys(counts) as ContractBadge[]).map((key) => ({
      label: CONTRACT_BADGE_LABEL[key],
      value: counts[key],
    }));
  }
}
