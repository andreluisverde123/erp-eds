import { apiClient } from '@/lib/api-client';

import type { AuditLogEntry } from '@/features/configuracoes/types';

export function listEntityHistory(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
  return apiClient.get(`/audit-logs/entity/${entityType}/${entityId}`);
}
