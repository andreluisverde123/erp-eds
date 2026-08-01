import { apiClient } from '@/lib/api-client';

export interface TrashItem {
  entityType: string;
  entityLabel: string;
  module: string;
  id: string;
  title: string;
  deletedAt: string;
  /// Falso quando o usuário enxerga o módulo mas não tem permissão de escrita
  /// nele — o botão aparece desabilitado em vez de o item sumir da lista.
  canRestore: boolean;
}

export function listTrash(entityType?: string): Promise<TrashItem[]> {
  const query = entityType ? `?entityType=${encodeURIComponent(entityType)}` : '';
  return apiClient.get<TrashItem[]>(`/trash${query}`);
}

export function restoreTrashItem(entityType: string, id: string): Promise<TrashItem> {
  return apiClient.post<TrashItem>(`/trash/${entityType}/${id}/restore`);
}
