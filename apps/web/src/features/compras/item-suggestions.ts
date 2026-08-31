import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

/// Um material que a empresa JÁ PEDIU antes.
export interface ItemSuggestion {
  description: string;
  timesUsed: number;
}

/// Sugestões a partir do histórico de solicitações da própria empresa.
///
/// Não é catálogo: não existe cadastro de materiais no ERP, e a pessoa
/// continua livre para digitar algo que nunca foi pedido.
export function searchItemSuggestions(search: string): Promise<ItemSuggestion[]> {
  return apiClient.get(`/purchase-requests/item-suggestions${toQueryString({ search })}`);
}
