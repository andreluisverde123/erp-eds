import type { CatalogItemType } from '@/features/catalogo/types';

export type { PaginatedResult } from '@/features/catalogo/types';

/// Uma composição na listagem.
///
/// Os valores numéricos chegam como TEXTO com escala fixa (`"75.0000"`), do
/// jeito que o Decimal do servidor os produz. A tela formata para mostrar e
/// nunca refaz a conta: `unitCost` é o que o backend calculou.
export interface CompositionSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  active: boolean;
  itemCount: number;
  unitCost: string;
  createdAt: string;
  updatedAt: string;
}

/// O insumo da linha, lido do cadastro. O nome acompanha o catálogo; o preço
/// não existe lá.
export interface CompositionItemCatalog {
  id: string;
  code: string;
  name: string;
  unit: string;
  type: CatalogItemType;
  active: boolean;
}

export interface CompositionItem {
  id: string;
  catalogItemId: string;
  /// Seis casas, na unidade do insumo, por unidade da composição.
  coefficient: string;
  /// Quatro casas.
  unitPrice: string;
  /// Coeficiente × preço, calculado no servidor.
  totalCost: string;
  catalogItem: CompositionItemCatalog;
}

export interface Composition extends CompositionSummary {
  items: CompositionItem[];
}

export interface CompositionInput {
  name: string;
  unit: string;
  description?: string;
  active?: boolean;
}

export interface CompositionQuery {
  page?: number;
  limit?: number;
  search?: string;
  /// 'true' | 'false', porque vai na query.
  active?: string;
}

/// Um insumo que pode entrar numa composição: ativo, da empresa.
export interface CatalogOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  type: CatalogItemType;
  /// O preço de referência vigente hoje, como SUGESTÃO para a linha. Nulo
  /// quando o insumo não tem histórico — e a linha continua podendo ser
  /// preenchida à mão.
  referencePrice: {
    unitPrice: string;
    unit: string;
    referenceDate: string;
    source: 'MANUAL' | 'PURCHASE';
  } | null;
}

/// O que se envia ao incluir uma linha. **Sem `totalCost`**: a API recusa o
/// campo, e o custo é sempre o que ela calcula.
export interface CompositionItemInput {
  catalogItemId: string;
  coefficient: number;
  unitPrice: number;
}

export type CompositionItemUpdate = { coefficient: number } | { unitPrice: number };
