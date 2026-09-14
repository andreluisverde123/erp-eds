import type { ReferenceRegime, ReferenceSource } from '@/features/orcamentos/types';

export type { PaginatedResult } from '@/features/catalogo/types';
export type { ReferenceRegime, ReferenceSource } from '@/features/orcamentos/types';

/// Uma base importada: SINAPI (uma UF e um regime) ou SICRO (uma UF).
export interface ReferenceDataset {
  id: string;
  source: ReferenceSource;
  /// "AAAA-MM".
  competence: string;
  referenceDate: string;
  uf: string;
  locality: string | null;
  regime: ReferenceRegime;
  versionLabel: string;
  publishedAt: string | null;
  fileNames: string[];
  itemCount: number;
  compositionCount: number;
  metadata: Record<string, unknown>;
  importedAt: string;
}

export interface ReferenceImportIssue {
  code: string;
  message: string;
  file?: string;
  sheet?: string;
  row?: number;
}

/// O que a prévia mostra antes de confirmar. Nada foi gravado.
export interface ReferenceDatasetPreview {
  source: ReferenceSource;
  competence: string | null;
  referenceDate: string | null;
  uf: string | null;
  locality: string | null;
  regime: ReferenceRegime;
  versionLabel: string;
  publishedAt: string | null;
  itemCount: number;
  compositionCount: number;
  componentCount: number;
  itemsWithoutPrice: number;
  compositionsWithoutCost: number;
  errors: ReferenceImportIssue[];
  errorCount: number;
  warnings: ReferenceImportIssue[];
  warningCount: number;
  fileNames: string[];
  fileHash: string;
  duplicate: { id: string; importedAt: string } | null;
  availableUfs: string[] | null;
  canImport: boolean;
}

export interface ReferenceDatasetQuery {
  page?: number;
  limit?: number;
  source?: ReferenceSource;
  uf?: string;
  regime?: ReferenceRegime;
  competence?: string;
}

export interface ReferenceSearchQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ReferenceItemRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  category: string | null;
  /// Nulo = sem preço nesta UF.
  unitPrice: string | null;
  metadata: Record<string, unknown>;
}

export interface ReferenceCompositionRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  group: string | null;
  /// Nulo = sem custo nesta referência.
  unitCost: string | null;
  situation: string | null;
  componentCount: number;
}

export interface ReferenceCompositionDetail extends Omit<ReferenceCompositionRow, 'componentCount'> {
  metadata: Record<string, unknown>;
  dataset: ReferenceDataset;
  components: {
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
    metadata: Record<string, unknown>;
  }[];
}

export interface ReferenceImportInput {
  source: ReferenceSource;
  files: File[];
  uf?: string;
  regime?: ReferenceRegime;
  versionLabel?: string;
}
