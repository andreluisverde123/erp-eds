export type ConstructionStatus = 'PLANNING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /// Nulo quando o centro de custo não pertence a nenhuma obra — ele é o
  /// destino da compra, e "Escritório" ou "Fazenda" também são destinos.
  constructionSiteId: string | null;
  constructionSite: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionSite {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  responsibleId: string | null;
  /// O responsável como usuário, quando houver. `null` nas obras antigas, que
  /// só têm o nome digitado.
  responsible: { id: string; name: string; email: string } | null;
  responsibleName: string | null;
  description: string | null;
  status: ConstructionStatus;
  city: string | null;
  state: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { costCenters: number };
}

export interface ConstructionSiteDetail extends ConstructionSite {
  costCenters: CostCenter[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ConstructionSiteQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ConstructionStatus;
  city?: string;
}

export interface ConstructionSiteInput {
  code: string;
  name: string;
  clientName?: string;
  city?: string;
  state?: string;
  startDate?: string;
  expectedEndDate?: string;
  status?: ConstructionStatus;
  /// Escolher o responsável concede a ele a obra no Diário.
  responsibleId?: string;
  responsibleName?: string;
  description?: string;
}

export interface CostCenterQuery {
  page?: number;
  limit?: number;
  search?: string;
  constructionSiteId?: string;
}

export interface CostCenterInput {
  code: string;
  name: string;
  description?: string;
  constructionSiteId?: string;
}
