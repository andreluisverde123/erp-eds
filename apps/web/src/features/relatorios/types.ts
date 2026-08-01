export interface ExecutiveSummary {
  activeConstructionSites: number;
  monthlyPurchases: { count: number; totalAmount: number };
  accountsPayable: { count: number; totalOpen: number };
  activeEmployees: number;
  activeContractors: number;
  expiringContracts: number;
}

export interface ChartPoint {
  label: string;
  value: number;
  count?: number;
}

export interface ComprasIndicators {
  bySite: ChartPoint[];
  bySupplier: ChartPoint[];
  byPeriod: ChartPoint[];
  averageValue: number;
  totalOrders: number;
}

export interface FinanceiroIndicators {
  paidVsOpen: ChartPoint[];
  cashFlow: ChartPoint[];
  expensesBySite: ChartPoint[];
}

export interface EngenhariaIndicators {
  sitesByStatus: ChartPoint[];
  sitesProgress: ChartPoint[];
  topCostCenters: ChartPoint[];
}

export interface RhIndicators {
  employeesBySite: ChartPoint[];
  dailyProduction: ChartPoint[];
  hoursWorked: ChartPoint[];
}

export interface TerceirosIndicators {
  contractsByBadge: ChartPoint[];
  activeContractors: number;
  totalContractors: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type ReportType = 'obras' | 'compras' | 'financeiro' | 'rh' | 'terceiros';

export interface ReportQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  city?: string;
  supplierId?: string;
  constructionSiteId?: string;
  contractorId?: string;
  position?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/// Campos Decimal do Prisma (totalAmount, amount, budgetAmount) vêm
/// serializados como string no JSON — nunca number.
export interface ObraReportRow {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  status: string;
  city: string | null;
  state: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  budgetAmount: string | null;
}

export interface CompraReportRow {
  id: string;
  code: string;
  totalAmount: string;
  issueDate: string;
  status: string;
  supplier: { id: string; legalName: string; tradeName: string | null };
  constructionSite: { id: string; name: string };
}

export interface FinanceiroReportRow {
  id: string;
  amount: string;
  dueDate: string;
  status: string;
  invoice: {
    number: string;
    supplier: { id: string; legalName: string; tradeName: string | null };
  };
}

export interface RhReportRow {
  id: string;
  name: string;
  position: string;
  status: string;
  hireDate: string;
  currentAllocation: { constructionSite: { id: string; name: string } } | null;
}

export interface TerceirosReportRow {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  responsibleName: string | null;
  status: string;
  _count: { contracts: number };
}
