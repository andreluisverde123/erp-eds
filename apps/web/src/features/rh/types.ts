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
export type EmploymentType = 'OWN' | 'OUTSOURCED';
export type CompensationType = 'CLT' | 'DAILY';

export interface Employee {
  id: string;
  name: string;
  cpf: string;
  position: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  compensationType: CompensationType;
  /// Decimal do banco: chega como string, e é `null` para quem não é diarista.
  dailyRate: string | null;
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
  employmentType?: EmploymentType;
  compensationType?: CompensationType;
  dailyRate?: number;
  hireDate: string;
  terminationDate?: string;
  baseSalary?: number;
}

export interface EmployeeQuery {
  employmentType?: EmploymentType;
  compensationType?: CompensationType;
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

// ---------------------------------------------------------------------------
// PRESENÇA (RH-03)
// ---------------------------------------------------------------------------

/// Situação de uma pessoa na chamada do dia.
///
/// `NAO_APONTADO` não é o mesmo que `AUSENTE`: o primeiro é trabalho a fazer, o
/// segundo é informação registrada. Sem essa distinção, o mestre de obras não
/// sabe se já passou por aquele dia.
export type SituacaoDoApontamento = 'PRESENTE' | 'AUSENTE' | 'NAO_APONTADO';

export interface AttendanceRow {
  employeeId: string;
  name: string;
  position: string;
  situacao: SituacaoDoApontamento;
}

/// A chamada de uma obra num dia. As linhas vêm da ALOCAÇÃO daquela data.
export interface AttendanceDay {
  constructionSiteId: string;
  date: string;
  rows: AttendanceRow[];
}

export interface AttendanceDayInput {
  constructionSiteId: string;
  date: string;
  entries: { employeeId: string; present: boolean }[];
}

export interface AttendanceSummary {
  daysPresent: number;
  daysAbsent: number;
  daysRecorded: number;
}

// ---------------------------------------------------------------------------
// CUSTO DE MÃO DE OBRA (RH-04)
// ---------------------------------------------------------------------------

/// Um custo tem TRÊS estados, não um número.
///
/// `DESCONHECIDO` vem com `valor: null` — e é `null`, não zero, porque zero
/// somaria no total da obra e ninguém notaria que falta informação.
export interface Custo {
  estado: 'CONHECIDO' | 'PARCIAL' | 'DESCONHECIDO';
  valor: string | null;
  /// O que impede o custo de estar completo, em linguagem de quem lê.
  faltando: string[];
}

export interface LaborCostEmployee {
  employeeId: string;
  name: string;
  position: string;
  employmentType: EmploymentType;
  compensationType: CompensationType;
  diasNaObra: number;
  diasPresentesNoPeriodo: number;
  /// Só para CLT. Diarista não rateia: o custo dele é inteiro da obra.
  percentual: number | null;
  custo: Custo;
}

export interface LaborCostContract {
  contractId: string;
  code: string;
  scope: string;
  contractorName: string;
  pricingType: 'GLOBAL' | 'UNIT';
  unitLabel: string | null;
  unitPrice: string | null;
  measuredQuantity: string | null;
  /// Valor contratado (global) ou medido acumulado (unitário). É INFORMAÇÃO do
  /// contrato — não o custo deste período.
  valorInformado: string | null;
  rotuloDoValor: string;
  /// O que pode ser atribuído a este período. Hoje sempre desconhecido: sem
  /// medições datadas, não há como dizer quanto da empreitada foi consumido
  /// aqui, e atribuir o total daria o mesmo dinheiro em dois meses.
  custo: Custo;
}

export interface LaborCostReport {
  constructionSiteId: string;
  from: string;
  to: string;
  colaboradores: LaborCostEmployee[];
  empreitadas: LaborCostContract[];
  resumo: {
    colaboradores: Custo;
    empreitadas: Custo;
    maoDeObra: Custo;
  };
}

/// Transferência de obra: a partir de `date`, o colaborador passa a trabalhar
/// em `constructionSiteId`. A alocação anterior é encerrada na véspera pelo
/// backend — não se informa qual é.
export interface EmployeeTransferInput {
  employeeId: string;
  constructionSiteId: string;
  costCenterId?: string;
  date: string;
}

export interface EmployeeAllocationQuery {
  /// Quem estava alocado NESTE dia.
  onDate?: string;
  from?: string;
  to?: string;
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
  /// Custo do empregador. `null` = DESCONHECIDO, nunca zero.
  employerCharges: string | null;
  benefits: string | null;
  provisions: string | null;
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
  employerCharges?: number;
  benefits?: number;
  provisions?: number;
}

export interface PayslipQuery {
  page?: number;
  limit?: number;
  search?: string;
  employeeId?: string;
  referenceYear?: number;
  referenceMonth?: number;
}
