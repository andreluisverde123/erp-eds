import type { CatalogItemType } from '@/features/catalogo/types';

export type { PaginatedResult } from '@/features/catalogo/types';

export type BudgetStatus = 'DRAFT' | 'CLOSED';
export type BudgetItemSource = 'COMPOSITION' | 'CATALOG_ITEM' | 'MANUAL' | 'REFERENCE';
export type ReferenceSource = 'SINAPI' | 'SICRO';
export type ReferenceRegime = 'NAO_DESONERADO' | 'DESONERADO' | 'SEM_ENCARGOS';
/// De onde veio o custo de uma composição própria na data-base.
export type CompositionPricing = 'HISTORICAL' | 'FALLBACK' | 'MIXED';

/// Custo direto, BDI e preço final — derivados no servidor a cada leitura.
export interface BudgetPrice {
  directCost: string;
  directCostExact: string;
  /// Percentual com 4 casas: "25.0000" = 25%.
  bdiPercent: string;
  bdiValue: string;
  finalPrice: string;
}

/// Os valores chegam como TEXTO: o monetário já em centavos (`totalCost`) e o
/// exato ao lado (`totalCostExact`). A tela mostra o monetário e nunca refaz
/// conta nenhuma — o servidor soma os exatos e arredonda uma vez por nível.
export interface BudgetSummary extends BudgetPrice {
  id: string;
  code: string;
  version: number;
  name: string;
  description: string | null;
  referenceDate: string;
  status: BudgetStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  constructionSite: { id: string; code: string; name: string };
  /// É o orçamento oficial da obra.
  isOfficial: boolean;
  itemCount: number;
  totalCost: string;
  totalCostExact: string;
}

/// Um grupo da EAP, já numerado ("2.1") e na ordem da árvore (pré-ordem).
export interface BudgetNode {
  id: string;
  parentId: string | null;
  code: string;
  depth: number;
  name: string;
  position: number;
  /// Itens do grupo e dos descendentes.
  itemCount: number;
  subtotal: string;
  subtotalExact: string;
}

export interface BudgetItemComponent {
  id: string;
  catalogItemId: string;
  code: string;
  name: string;
  type: CatalogItemType;
  unit: string;
  coefficient: string;
  unitPrice: string;
  totalCost: string;
  /// Preço da data-base (HISTORICAL) ou da própria composição (FALLBACK). Nulo
  /// nos itens incluídos antes desta regra.
  priceOrigin?: 'HISTORICAL' | 'FALLBACK' | null;
  referencePriceId?: string | null;
}

/// Snapshot da base referencial copiado no item.
export interface BudgetItemReference {
  source: ReferenceSource;
  kind: 'ITEM' | 'COMPOSITION' | null;
  code: string | null;
  competence: string | null;
  uf: string | null;
  locality: string | null;
  regime: ReferenceRegime | null;
  versionLabel: string | null;
  datasetId: string | null;
  referenceItemId: string | null;
  referenceCompositionId: string | null;
}

/// Linha analítica da composição de base referencial, copiada no item.
export interface BudgetItemReferenceComponent {
  id: string;
  position: number;
  section: string | null;
  kind: string;
  code: string;
  description: string;
  unit: string | null;
  coefficient: string | null;
  unitPrice: string | null;
  totalCost: string | null;
  situation: string | null;
}

export interface BudgetItem {
  id: string;
  budgetNodeId: string;
  /// Código EAP do item ("1.2.3"), derivado no servidor.
  code?: string | null;
  position: number;
  source: BudgetItemSource;
  compositionId: string | null;
  catalogItemId: string | null;
  referencePriceId: string | null;
  sourceCode: string | null;
  catalogItemType: CatalogItemType | null;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  totalCostExact: string;
  compositionPricing?: CompositionPricing | null;
  reference?: BudgetItemReference | null;
  /// As linhas da composição COPIADAS na inclusão. Vazio fora de composição.
  components: BudgetItemComponent[];
  referenceComponents?: BudgetItemReferenceComponent[];
}

export interface Budget extends BudgetSummary {
  closedBy: { name: string } | null;
  createdBy: { name: string } | null;
  revisedFrom?: { id: string; version: number } | null;
  nodeCount?: number;
  bdiNote?: string | null;
  nodes: BudgetNode[];
  items: BudgetItem[];
}

export interface BudgetVersion {
  id: string;
  version: number;
  status: BudgetStatus;
  closedAt: string | null;
  createdAt: string;
  revisedFromId: string | null;
  isOfficial: boolean;
}

export interface BudgetInput {
  constructionSiteId: string;
  name: string;
  description?: string;
  referenceDate: string;
}

export interface BudgetBdiInput {
  bdiPercent: number;
  bdiNote: string;
}

export interface BudgetQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: BudgetStatus;
}

export interface ConstructionSiteOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

/// Composição ativa com o custo unitário NA DATA-BASE — o que será congelado.
export interface CompositionOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  itemCount: number;
  unitCost: string;
  pricing?: CompositionPricing | null;
}

/// Insumo ativo com o preço vigente NA DATA-BASE do orçamento, como sugestão.
export interface CatalogOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  type: CatalogItemType;
  referencePrice: {
    unitPrice: string;
    unit: string;
    referenceDate: string;
    source: 'MANUAL' | 'PURCHASE';
  } | null;
}

/// Base referencial que pode entrar no orçamento (competência ≤ data-base).
export interface ReferenceDatasetOption {
  id: string;
  source: ReferenceSource;
  competence: string;
  uf: string;
  locality: string | null;
  regime: ReferenceRegime;
  versionLabel: string;
  itemCount: number;
  compositionCount: number;
}

/// Insumo ou composição de uma base, com o custo publicado.
export interface ReferenceOption {
  id: string;
  kind: 'ITEM' | 'COMPOSITION';
  code: string;
  description: string;
  unit: string;
  category: string | null;
  unitCost: string;
  componentCount: number;
}

/// O que se envia para incluir uma linha. Sem total, nunca; sem custo, na
/// composição e na base referencial — ele vem delas.
export type BudgetItemInput =
  | { budgetNodeId: string; source: 'COMPOSITION'; compositionId: string; quantity: number }
  | {
      budgetNodeId: string;
      source: 'CATALOG_ITEM';
      catalogItemId: string;
      quantity: number;
      unitCost: number;
    }
  | {
      budgetNodeId: string;
      source: 'MANUAL';
      description: string;
      unit: string;
      quantity: number;
      unitCost: number;
    }
  | {
      budgetNodeId: string;
      source: 'REFERENCE';
      referenceItemId?: string;
      referenceCompositionId?: string;
      quantity: number;
    };

export interface BudgetItemUpdate {
  quantity?: number;
  unitCost?: number;
  description?: string;
  unit?: string;
}

export interface BudgetImportIssue {
  row: number | null;
  message: string;
}

export interface BudgetImportPreview {
  fileHash: string;
  errors: BudgetImportIssue[];
  warnings: BudgetImportIssue[];
  summary: {
    groupCount: number;
    itemCount: number;
    byType: Record<'MANUAL' | 'INSUMO' | 'COMPOSICAO' | 'REFERENCIA', number>;
    directCost: string;
    directCostExact: string;
  };
  canImport: boolean;
}
