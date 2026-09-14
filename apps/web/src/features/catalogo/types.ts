/// Paginação, no mesmo formato dos outros módulos. Repetida aqui como em
/// `compras` e `terceiros` — cada feature declara a sua; extrair para um lugar
/// comum é refatoração de outro escopo.
export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/// Material, mão de obra ou equipamento. Mão de obra e equipamento são
/// RECURSOS DE COMPOSIÇÃO: "Pedreiro" aqui não é um colaborador do RH, e
/// "Betoneira" não é patrimônio.
export type CatalogItemType = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

/// Um insumo do cadastro da empresa.
///
/// Sem preço, e é deliberado: o catálogo responde "o que é este insumo", nunca
/// "quanto ele custa". Preço tem quatro naturezas no ERP — referencial, cotado,
/// comprado e faturado — e nenhuma delas pertence a um cadastro. O preço usado
/// numa composição mora na linha da composição.
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  description: string | null;
  type: CatalogItemType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemInput {
  name: string;
  unit: string;
  category?: string;
  description?: string;
  /// Só na criação. A API recusa na edição: a natureza escolheu o prefixo do
  /// código.
  type?: CatalogItemType;
  active?: boolean;
}

export interface CatalogItemQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  type?: CatalogItemType;
  /// String porque vai na query: 'true' | 'false'.
  active?: string;
}

/// Unidade canônica, servida pela API — a mesma lista que o validador usa, para
/// a tela nunca oferecer um código que o servidor recusa.
export interface MeasurementUnit {
  code: string;
  name: string;
}
