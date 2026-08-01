import { ChevronDown } from 'lucide-react';
import { Badge, cn } from '@repo/ui';

import { AuditActionBadge } from '@/features/configuracoes/components/audit-action-badge';
import type { AuditLogEntry } from '@/features/configuracoes/types';

import { isSoftDeleteChange, type FieldChanges } from '../field-changes';
import { FieldDiff } from './field-diff';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getChanges(entry: AuditLogEntry): FieldChanges | null {
  return entry.changes && typeof entry.changes === 'object'
    ? (entry.changes as FieldChanges)
    : null;
}

function HistoryEntryRow({ entry }: { entry: AuditLogEntry }) {
  const changes = getChanges(entry);
  const hasDiff = Boolean(changes && Object.keys(changes).length > 0);
  const softDeleted = changes ? isSoftDeleteChange(changes) : false;

  const row = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-foreground">
        {entry.user?.name ?? 'Usuário removido'}
      </span>
      {softDeleted ? (
        <Badge variant="destructive">Excluído</Badge>
      ) : (
        <AuditActionBadge action={entry.action} />
      )}
      <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
    </div>
  );

  if (!hasDiff || !changes) {
    return <li className="flex gap-3 py-2">{row}</li>;
  }

  return (
    <li className="py-2">
      <details className="group flex flex-col gap-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          {row}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className={cn('pl-0')}>
          <FieldDiff changes={changes} />
        </div>
      </details>
    </li>
  );
}

export function HistoryTimeline({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>;
  }

  return (
    <ol className="flex flex-col divide-y divide-border">
      {entries.map((entry) => (
        <HistoryEntryRow key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}
