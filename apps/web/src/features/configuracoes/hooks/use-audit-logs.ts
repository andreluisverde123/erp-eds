import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listAuditLogModules, listAuditLogs } from '../api';
import type { AuditLogQuery } from '../types';

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: ['audit-logs', 'list', query],
    queryFn: () => listAuditLogs(query),
    placeholderData: keepPreviousData,
  });
}

export function useAuditLogModules() {
  return useQuery({ queryKey: ['audit-logs', 'modules'], queryFn: () => listAuditLogModules() });
}
