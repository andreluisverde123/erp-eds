import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

/// Um insumo do CADASTRO da empresa, com o mínimo para ser escolhido numa
/// linha de solicitação. Sem preço: o catálogo não tem.
export interface CatalogSuggestion {
  id: string;
  code: string;
  name: string;
  unit: string;
}

/// Insumos ATIVOS do cadastro que casam com o que está sendo digitado.
///
/// A rota mora em `/purchase-requests`, e não em `/catalog-items`, porque serve
/// o formulário de solicitação e exige a permissão dele (`compras.request`) —
/// não a de manter o catálogo.
export function searchCatalogSuggestions(search: string): Promise<CatalogSuggestion[]> {
  return apiClient.get(`/purchase-requests/catalog-suggestions${toQueryString({ search })}`);
}
