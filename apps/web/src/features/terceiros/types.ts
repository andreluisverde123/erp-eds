export type ContractorStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type ContractBadgeStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED';
export type DocumentBadgeStatus = 'VALID' | 'EXPIRING' | 'EXPIRED';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ConstructionSiteRef {
  id: string;
  code: string;
  name: string;
}

interface ContractorRef {
  id: string;
  legalName: string;
  tradeName: string | null;
}

interface ContractRef {
  id: string;
  code: string;
  contractor: ContractorRef;
  constructionSite?: ConstructionSiteRef;
}

/// Campos Decimal do Prisma (totalValue) vêm serializados como string no
/// JSON — nunca number. Parsear com Number() antes de calcular.
export interface Contractor {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  specialty: string | null;
  responsibleName: string | null;
  status: ContractorStatus;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

export interface ContractorInput {
  legalName: string;
  tradeName?: string;
  document: string;
  specialty?: string;
  responsibleName?: string;
  status?: ContractorStatus;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
}

export interface ContractorQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ContractorStatus;
  city?: string;
}

export interface Contract {
  id: string;
  code: string;
  scope: string;
  totalValue: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'CANCELLED';
  badgeStatus: ContractBadgeStatus;
  daysRemaining: number;
  contractor: ContractorRef;
  constructionSite: ConstructionSiteRef;
}

export interface ContractInput {
  contractorId: string;
  constructionSiteId: string;
  scope: string;
  totalValue: number;
  startDate: string;
  endDate: string;
}

export interface ContractQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractorId?: string;
  constructionSiteId?: string;
  badgeStatus?: ContractBadgeStatus;
}

export interface ContractExpiringSummary {
  count: number;
  contracts: {
    id: string;
    code: string;
    contractorName: string;
    endDate: string;
    daysRemaining: number;
  }[];
}

export interface DocumentAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
}

export interface ContractDocument {
  id: string;
  name: string;
  issueDate: string | null;
  expiresAt: string;
  badgeStatus: DocumentBadgeStatus;
  attachment: DocumentAttachment | null;
  contract: ContractRef;
}

export interface ContractDocumentInput {
  contractId: string;
  name: string;
  issueDate?: string;
  expiresAt: string;
}

export interface ContractDocumentQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractId?: string;
  contractorId?: string;
  badgeStatus?: DocumentBadgeStatus;
}

export interface DocumentExpiringSummary {
  expiredCount: number;
  expiringCount: number;
}

export interface ContractEmployee {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  contract: ContractRef;
}

export interface ContractEmployeeInput {
  contractId: string;
  name: string;
  role: string;
  isActive?: boolean;
}

export interface ContractEmployeeQuery {
  page?: number;
  limit?: number;
  search?: string;
  contractId?: string;
  contractorId?: string;
  constructionSiteId?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}
