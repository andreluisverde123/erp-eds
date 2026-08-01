import { memo } from 'react';

import { History } from 'lucide-react';
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { AuditActionBadge } from './audit-action-badge';
import { getModuleForEntityType } from '../audit-log-entity-modules';
import { getModuleLabel } from '../permission-modules';
import type { AuditLogEntry } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export const AuditLogsTable = memo(function AuditLogsTable({ logs }: { logs: AuditLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nenhum evento encontrado"
        description="Ajuste os filtros para ver outros registros."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuário</TableHead>
          <TableHead>Módulo</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>Registro afetado</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Data/Hora</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="text-foreground">
              {log.user?.name ?? 'Usuário removido'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {getModuleLabel(getModuleForEntityType(log.entityType))}
            </TableCell>
            <TableCell>
              <AuditActionBadge action={log.action} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {log.entityType} #{log.entityId.slice(0, 8)}
            </TableCell>
            <TableCell className="text-muted-foreground">{log.ipAddress ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
