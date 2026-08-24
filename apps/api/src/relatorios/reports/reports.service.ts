import { Injectable, NotFoundException } from '@nestjs/common';

import {
  type AccountPayableStatus,
  type ConstructionStatus,
  type ContractorStatus,
  type EmployeeStatus,
  Prisma,
  type PurchaseOrderStatus,
} from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { startOfDay } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryReportDto } from './dto/query-report.dto';
import { capExportRows, type ExportColumn } from './export.util';
import { formatCurrency, formatDate } from './format.util';

export type ReportType = 'obras' | 'compras' | 'financeiro' | 'rh' | 'terceiros';

export interface ExportPayload {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, string>[];
}

const SITE_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planejamento',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const PURCHASE_ORDER_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  ISSUED: 'Emitida',
  RECEIVED: 'Recebida',
  CANCELLED: 'Cancelada',
};

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Em Aberto',
  PARTIAL: 'Parcial',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const EMPLOYEE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  VACATION: 'Férias',
  ON_LEAVE: 'Afastado',
  TERMINATED: 'Desligado',
};

const CONTRACTOR_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
};

/// Cada relatório segue o mesmo esqueleto: `buildXWhere`/`buildXOrderBy`
/// (reaproveitados por list E export, pra nunca divergir o que a tela mostra
/// do que o Excel/PDF exporta) + um `findX` paginado + um `exportX` que
/// busca até MAX_EXPORT_ROWS sem paginação e formata pra string.
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================================
  // Obras
  // =====================================================================

  private buildObrasWhere(
    companyId: string,
    query: QueryReportDto,
  ): Prisma.ConstructionSiteWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: query.status as ConstructionStatus | undefined,
      city: query.city ? { equals: query.city, mode: 'insensitive' } : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { clientName: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }

  private buildObrasOrderBy(
    query: QueryReportDto,
  ): Prisma.ConstructionSiteOrderByWithRelationInput {
    const dir = query.sortDir ?? 'asc';
    switch (query.sortBy) {
      case 'code':
        return { code: dir };
      case 'status':
        return { status: dir };
      case 'startDate':
        return { startDate: dir };
      case 'expectedEndDate':
        return { expectedEndDate: dir };
      case 'budgetAmount':
        return { budgetAmount: dir };
      default:
        return { name: dir };
    }
  }

  async findObras(companyId: string, query: QueryReportDto) {
    const where = this.buildObrasWhere(companyId, query);
    const orderBy = this.buildObrasOrderBy(query);
    const { page, limit } = query;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.constructionSite.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.constructionSite.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async exportObras(companyId: string, query: QueryReportDto): Promise<ExportPayload> {
    const where = this.buildObrasWhere(companyId, query);
    const orderBy = this.buildObrasOrderBy(query);
    const data = capExportRows(
      await this.prisma.constructionSite.findMany({ where, orderBy, take: 5000 }),
    );

    const columns: ExportColumn[] = [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nome' },
      { key: 'clientName', label: 'Cliente' },
      { key: 'status', label: 'Status' },
      { key: 'city', label: 'Cidade/UF' },
      { key: 'startDate', label: 'Início' },
      { key: 'expectedEndDate', label: 'Previsão Fim' },
      { key: 'budgetAmount', label: 'Orçamento', align: 'right' },
    ];

    const rows = data.map((site) => ({
      code: site.code,
      name: site.name,
      clientName: site.clientName ?? '—',
      status: SITE_STATUS_LABEL[site.status] ?? site.status,
      city: site.city ? `${site.city}${site.state ? `/${site.state}` : ''}` : '—',
      startDate: formatDate(site.startDate),
      expectedEndDate: formatDate(site.expectedEndDate),
      budgetAmount: formatCurrency(site.budgetAmount),
    }));

    return { title: 'Relatório de Obras', columns, rows };
  }

  // =====================================================================
  // Compras
  // =====================================================================

  private comprasIncludeArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
    include: {
      supplier: { select: { id: true, legalName: true, tradeName: true } },
      constructionSite: { select: { id: true, name: true } },
    },
  });

  private buildComprasWhere(
    companyId: string,
    query: QueryReportDto,
  ): Prisma.PurchaseOrderWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: query.status as PurchaseOrderStatus | undefined,
      supplierId: query.supplierId,
      constructionSiteId: query.constructionSiteId,
      issueDate:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            { code: { contains: query.search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private buildComprasOrderBy(query: QueryReportDto): Prisma.PurchaseOrderOrderByWithRelationInput {
    const dir = query.sortDir ?? 'desc';
    switch (query.sortBy) {
      case 'code':
        return { code: dir };
      case 'totalAmount':
        return { totalAmount: dir };
      case 'status':
        return { status: dir };
      default:
        return { issueDate: dir };
    }
  }

  async findCompras(companyId: string, query: QueryReportDto) {
    const where = this.buildComprasWhere(companyId, query);
    const orderBy = this.buildComprasOrderBy(query);
    const { page, limit } = query;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        ...this.comprasIncludeArgs,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async exportCompras(companyId: string, query: QueryReportDto): Promise<ExportPayload> {
    const where = this.buildComprasWhere(companyId, query);
    const orderBy = this.buildComprasOrderBy(query);
    const data = capExportRows(
      await this.prisma.purchaseOrder.findMany({
        where,
        ...this.comprasIncludeArgs,
        orderBy,
        take: 5000,
      }),
    );

    const columns: ExportColumn[] = [
      { key: 'code', label: 'Número' },
      { key: 'supplier', label: 'Fornecedor' },
      { key: 'site', label: 'Obra' },
      { key: 'totalAmount', label: 'Valor', align: 'right' },
      { key: 'issueDate', label: 'Emissão' },
      { key: 'status', label: 'Status' },
    ];

    const rows = data.map((order) => ({
      code: order.code,
      supplier: order.supplier.tradeName ?? order.supplier.legalName,
      site: order.constructionSite?.name ?? '—',
      totalAmount: formatCurrency(order.totalAmount),
      issueDate: formatDate(order.issueDate),
      status: PURCHASE_ORDER_STATUS_LABEL[order.status] ?? order.status,
    }));

    return { title: 'Relatório de Compras', columns, rows };
  }

  // =====================================================================
  // Financeiro
  // =====================================================================

  private financeiroIncludeArgs = Prisma.validator<Prisma.AccountPayableDefaultArgs>()({
    include: {
      /// Direto da conta: contas avulsas não têm nota, e as que têm passaram
      /// a carregar o fornecedor na própria linha.
      supplier: { select: { id: true, legalName: true, tradeName: true } },
      invoice: { select: { number: true } },
    },
  });

  private buildFinanceiroWhere(
    companyId: string,
    query: QueryReportDto,
  ): Prisma.AccountPayableWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: query.status as AccountPayableStatus | undefined,
      dueDate:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      // Filtros DIRETOS na conta.
      //
      // Iam por `invoice: { ... }`. Num relacionamento anulável, um filtro de
      // relação exige que a relação exista — então, depois que a conta passou
      // a poder não ter nota, aquela cláusula excluiria silenciosamente toda
      // despesa avulsa do relatório financeiro, mesmo sem filtro nenhum
      // aplicado. O `supplierId` da própria conta não tem esse problema.
      supplierId: query.supplierId,
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' as const } },
              { documentNumber: { contains: query.search, mode: 'insensitive' as const } },
              { invoice: { number: { contains: query.search, mode: 'insensitive' as const } } },
              { supplier: { legalName: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
  }

  private buildFinanceiroOrderBy(
    query: QueryReportDto,
  ): Prisma.AccountPayableOrderByWithRelationInput {
    const dir = query.sortDir ?? 'asc';
    switch (query.sortBy) {
      case 'amount':
        return { amount: dir };
      case 'status':
        return { status: dir };
      default:
        return { dueDate: dir };
    }
  }

  async findFinanceiro(companyId: string, query: QueryReportDto) {
    const where = this.buildFinanceiroWhere(companyId, query);
    const orderBy = this.buildFinanceiroOrderBy(query);
    const { page, limit } = query;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.accountPayable.findMany({
        where,
        ...this.financeiroIncludeArgs,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountPayable.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async exportFinanceiro(companyId: string, query: QueryReportDto): Promise<ExportPayload> {
    const where = this.buildFinanceiroWhere(companyId, query);
    const orderBy = this.buildFinanceiroOrderBy(query);
    const data = capExportRows(
      await this.prisma.accountPayable.findMany({
        where,
        ...this.financeiroIncludeArgs,
        orderBy,
        take: 5000,
      }),
    );

    const columns: ExportColumn[] = [
      { key: 'supplier', label: 'Fornecedor' },
      { key: 'document', label: 'Documento' },
      { key: 'amount', label: 'Valor', align: 'right' },
      { key: 'dueDate', label: 'Vencimento' },
      { key: 'status', label: 'Status' },
    ];

    const rows = data.map((account) => ({
      supplier: account.supplier.tradeName ?? account.supplier.legalName,
      // Conta de nota se identifica pelo número dela; conta avulsa, pela
      // descrição (e pelo documento, quando houver um).
      document: account.invoice?.number ?? account.description ?? '—',
      amount: formatCurrency(account.amount),
      dueDate: formatDate(account.dueDate),
      status: ACCOUNT_STATUS_LABEL[account.status] ?? account.status,
    }));

    return { title: 'Relatório Financeiro', columns, rows };
  }

  // =====================================================================
  // RH
  // =====================================================================

  private rhIncludeArgs(today: Date) {
    return Prisma.validator<Prisma.EmployeeDefaultArgs>()({
      include: {
        allocations: {
          where: { deletedAt: null, OR: [{ endDate: null }, { endDate: { gte: today } }] },
          orderBy: { startDate: 'desc' as const },
          take: 1,
          include: { constructionSite: { select: { id: true, name: true } } },
        },
      },
    });
  }

  private buildRhWhere(
    companyId: string,
    query: QueryReportDto,
    today: Date,
  ): Prisma.EmployeeWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: query.status as EmployeeStatus | undefined,
      position: query.position,
      allocations: query.constructionSiteId
        ? {
            some: {
              constructionSiteId: query.constructionSiteId,
              deletedAt: null,
              OR: [{ endDate: null }, { endDate: { gte: today } }],
            },
          }
        : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { cpf: { contains: query.search, mode: 'insensitive' } },
            { position: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }

  private buildRhOrderBy(query: QueryReportDto): Prisma.EmployeeOrderByWithRelationInput {
    const dir = query.sortDir ?? 'asc';
    switch (query.sortBy) {
      case 'hireDate':
        return { hireDate: dir };
      case 'status':
        return { status: dir };
      default:
        return { name: dir };
    }
  }

  async findRh(companyId: string, query: QueryReportDto) {
    const today = startOfDay(new Date());
    const where = this.buildRhWhere(companyId, query, today);
    const orderBy = this.buildRhOrderBy(query);
    const { page, limit } = query;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        ...this.rhIncludeArgs(today),
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const rows = data.map((employee) => {
      const { allocations, ...rest } = employee;
      return { ...rest, currentAllocation: allocations[0] ?? null };
    });

    return paginate(rows, total, page, limit);
  }

  async exportRh(companyId: string, query: QueryReportDto): Promise<ExportPayload> {
    const today = startOfDay(new Date());
    const where = this.buildRhWhere(companyId, query, today);
    const orderBy = this.buildRhOrderBy(query);
    const data = capExportRows(
      await this.prisma.employee.findMany({
        where,
        ...this.rhIncludeArgs(today),
        orderBy,
        take: 5000,
      }),
    );

    const columns: ExportColumn[] = [
      { key: 'name', label: 'Nome' },
      { key: 'position', label: 'Cargo' },
      { key: 'site', label: 'Obra Atual' },
      { key: 'status', label: 'Status' },
      { key: 'hireDate', label: 'Admissão' },
    ];

    const rows = data.map((employee) => ({
      name: employee.name,
      position: employee.position,
      site: employee.allocations[0]?.constructionSite.name ?? '—',
      status: EMPLOYEE_STATUS_LABEL[employee.status] ?? employee.status,
      hireDate: formatDate(employee.hireDate),
    }));

    return { title: 'Relatório de RH', columns, rows };
  }

  // =====================================================================
  // Terceiros
  // =====================================================================

  private terceirosIncludeArgs = Prisma.validator<Prisma.ContractorDefaultArgs>()({
    include: { _count: { select: { contracts: { where: { deletedAt: null } } } } },
  });

  private buildTerceirosWhere(
    companyId: string,
    query: QueryReportDto,
  ): Prisma.ContractorWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: query.status as ContractorStatus | undefined,
      city: query.city ? { equals: query.city, mode: 'insensitive' } : undefined,
      OR: query.search
        ? [
            { legalName: { contains: query.search, mode: 'insensitive' } },
            { tradeName: { contains: query.search, mode: 'insensitive' } },
            { document: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }

  private buildTerceirosOrderBy(query: QueryReportDto): Prisma.ContractorOrderByWithRelationInput {
    const dir = query.sortDir ?? 'asc';
    switch (query.sortBy) {
      case 'status':
        return { status: dir };
      default:
        return { legalName: dir };
    }
  }

  async findTerceiros(companyId: string, query: QueryReportDto) {
    const where = this.buildTerceirosWhere(companyId, query);
    const orderBy = this.buildTerceirosOrderBy(query);
    const { page, limit } = query;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contractor.findMany({
        where,
        ...this.terceirosIncludeArgs,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractor.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async exportTerceiros(companyId: string, query: QueryReportDto): Promise<ExportPayload> {
    const where = this.buildTerceirosWhere(companyId, query);
    const orderBy = this.buildTerceirosOrderBy(query);
    const data = capExportRows(
      await this.prisma.contractor.findMany({
        where,
        ...this.terceirosIncludeArgs,
        orderBy,
        take: 5000,
      }),
    );

    const columns: ExportColumn[] = [
      { key: 'legalName', label: 'Razão Social' },
      { key: 'document', label: 'CNPJ' },
      { key: 'responsibleName', label: 'Responsável' },
      { key: 'status', label: 'Status' },
      { key: 'contractsCount', label: 'Contratos', align: 'right' },
    ];

    const rows = data.map((contractor) => ({
      legalName: contractor.legalName,
      document: contractor.document,
      responsibleName: contractor.responsibleName ?? '—',
      status: CONTRACTOR_STATUS_LABEL[contractor.status] ?? contractor.status,
      contractsCount: String(contractor._count.contracts),
    }));

    return { title: 'Relatório de Terceirizados', columns, rows };
  }

  // =====================================================================

  async findByType(
    type: ReportType,
    companyId: string,
    query: QueryReportDto,
  ): Promise<PaginatedResult<unknown>> {
    switch (type) {
      case 'obras':
        return this.findObras(companyId, query);
      case 'compras':
        return this.findCompras(companyId, query);
      case 'financeiro':
        return this.findFinanceiro(companyId, query);
      case 'rh':
        return this.findRh(companyId, query);
      case 'terceiros':
        return this.findTerceiros(companyId, query);
      default:
        throw new NotFoundException('Relatório desconhecido.');
    }
  }

  async exportByType(
    type: ReportType,
    companyId: string,
    query: QueryReportDto,
  ): Promise<ExportPayload> {
    switch (type) {
      case 'obras':
        return this.exportObras(companyId, query);
      case 'compras':
        return this.exportCompras(companyId, query);
      case 'financeiro':
        return this.exportFinanceiro(companyId, query);
      case 'rh':
        return this.exportRh(companyId, query);
      case 'terceiros':
        return this.exportTerceiros(companyId, query);
      default:
        throw new NotFoundException('Relatório desconhecido.');
    }
  }
}
