export type EmployeeStatus = 'ACTIVE' | 'VACATION' | 'ON_LEAVE' | 'TERMINATED';
export type TimeEntryStatus = 'OPEN' | 'CLOSED' | 'INCONSISTENT';
export type PayslipStatus = 'PENDING' | 'PAID';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ConstructionSiteRef {
  id: string;
  code: string;
  name: string;
}

interface CostCenterRef {
  id: string;
  code: string;
  name: string;
}

interface EmployeeRef {
  id: string;
  name: string;
  cpf: string;
}

export interface EmployeeAllocationRef {
  id: string;
  startDate: string;
  endDate: string | null;
  constructionSite: ConstructionSiteRef;
}

/// Campos Decimal do Prisma (baseSalary, hoursWorked, quantity, grossSalary,
/// deductions, netSalary) vêm serializados como string no JSON — nunca
/// number. Parsear com Number() antes de calcular.
export interface Employee {
  id: string;
  name: string;
  cpf: string;
  position: string;
  status: EmployeeStatus;
  hireDate: string;
  terminationDate: string | null;
  baseSalary: string | null;
  /// Derivado no backend: alocação mais recente sem data fim ou com data fim
  /// futura. Não é um campo de banco.
  currentAllocation: EmployeeAllocationRef | null;
}

export interface EmployeeInput {
  name: string;
  cpf: string;
  position: string;
  status?: EmployeeStatus;
  hireDate: string;
  terminationDate?: string;
  baseSalary?: number;
}

export interface EmployeeQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus;
  position?: string;
  constructionSiteId?: string;
}

export interface EmployeeAllocation {
  id: string;
  startDate: string;
  endDate: string | null;
  employee: EmployeeRef & { position: string };
  constructionSite: ConstructionSiteRef;
  costCenter: CostCenterRef | null;
}

export interface EmployeeAllocationInput {
  employeeId: string;
  constructionSiteId: string;
  costCenterId?: string;
  startDate: string;
  endDate?: string;
}

export interface EmployeeAllocationQuery {
  page?: number;
  limit?: number;
  employeeId?: string;
  constructionSiteId?: string;
}

export interface TimeEntry {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: string | null;
  status: TimeEntryStatus;
  notes: string | null;
  employee: EmployeeRef;
  constructionSite: ConstructionSiteRef | null;
}

export interface TimeEntryInput {
  employeeId: string;
  constructionSiteId?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

export interface TimeEntryQuery {
  page?: number;
  limit?: number;
  employeeId?: string;
  constructionSiteId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductionEntry {
  id: string;
  date: string;
  description: string;
  quantity: string;
  unit: string;
  employee: EmployeeRef;
  constructionSite: ConstructionSiteRef;
  costCenter: CostCenterRef | null;
}

export interface ProductionEntryInput {
  employeeId: string;
  constructionSiteId: string;
  costCenterId?: string;
  date: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface ProductionEntryQuery {
  page?: number;
  limit?: number;
  employeeId?: string;
  constructionSiteId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PayslipAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
}

export interface Payslip {
  id: string;
  referenceYear: number;
  referenceMonth: number;
  grossSalary: string;
  deductions: string;
  netSalary: string;
  paidAt: string | null;
  /// Derivado no backend a partir de `paidAt` — não é um campo de banco.
  status: PayslipStatus;
  employee: EmployeeRef;
  attachment: PayslipAttachment | null;
}

export interface PayslipInput {
  employeeId: string;
  referenceYear: number;
  referenceMonth: number;
  grossSalary: number;
  deductions: number;
  netSalary: number;
}

export interface PayslipQuery {
  page?: number;
  limit?: number;
  search?: string;
  employeeId?: string;
  referenceYear?: number;
  referenceMonth?: number;
}
