import { useMemo, useState } from 'react';
import { Download, History } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { exportToCsv } from '@/lib/csv-export';
import { AUDIT_ACTION_OPTIONS, getAuditActionLabel } from '@/features/configuracoes/audit-action';
import type { AuditAction, AuditLogEntry } from '@/features/configuracoes/types';

import type { FieldChanges } from '../field-changes';
import { useEntityHistory } from '../hooks/use-entity-history';
import { HistoryTimeline } from './history-timeline';

const ALL = 'ALL';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatChangesForExport(entry: AuditLogEntry): string {
  const changes =
    entry.changes && typeof entry.changes === 'object' ? (entry.changes as FieldChanges) : null;
  if (!changes) return '';
  return Object.entries(changes)
    .map(([field, { from, to }]) => `${field}: ${from ?? '—'} → ${to ?? '—'}`)
    .join('; ');
}

/// Painel de histórico genérico — mesma dupla `entityType`+`entityId` já
/// usada pelos painéis de Comentários/Anexos do Workflow
/// (`features/workflow/components/workflow-comments-panel.tsx`), mas plugável
/// em QUALQUER tela de detalhe do ERP, não só nos 3 pipelines.
export function RecordHistoryPanel({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data: entries, isLoading, isError } = useEntityHistory(entityType, entityId);
  const [action, setAction] = useState<AuditAction | typeof ALL>(ALL);
  const [userId, setUserId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const users = useMemo(() => {
    if (!entries) return [];
    const seen = new Map<string, string>();
    for (const entry of entries) {
      if (entry.user) seen.set(entry.user.id, entry.user.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((entry) => {
      if (action !== ALL && entry.action !== action) return false;
      if (userId !== ALL && entry.user?.id !== userId) return false;
      if (dateFrom && entry.createdAt < dateFrom) return false;
      if (dateTo && entry.createdAt > `${dateTo}T23:59:59.999`) return false;
      return true;
    });
  }, [entries, action, userId, dateFrom, dateTo]);

  const createdEntry = entries?.find((entry) => entry.action === 'CREATE') ?? entries?.[0];
  const lastEntry = entries && entries.length > 0 ? entries[entries.length - 1] : undefined;

  function handleExport() {
    exportToCsv(
      `historico-${entityType}-${entityId}.csv`,
      [
        {
          key: 'createdAt',
          label: 'Data/Hora',
          value: (row: AuditLogEntry) => formatDateTime(row.createdAt),
        },
        {
          key: 'user',
          label: 'Usuário',
          value: (row: AuditLogEntry) => row.user?.name ?? 'Usuário removido',
        },
        {
          key: 'action',
          label: 'Ação',
          value: (row: AuditLogEntry) => getAuditActionLabel(row.action),
        },
        {
          key: 'changes',
          label: 'Alterações',
          value: (row: AuditLogEntry) => formatChangesForExport(row),
        },
      ],
      filtered,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {createdEntry && (
            <p className="text-sm text-muted-foreground">
              Criado por{' '}
              <span className="font-medium text-foreground">
                {createdEntry.user?.name ?? 'Usuário removido'}
              </span>{' '}
              em {formatDateTime(createdEntry.createdAt)}
            </p>
          )}
          {lastEntry && lastEntry.id !== createdEntry?.id && (
            <p className="text-sm text-muted-foreground">
              Última edição por{' '}
              <span className="font-medium text-foreground">
                {lastEntry.user?.name ?? 'Usuário removido'}
              </span>{' '}
              em {formatDateTime(lastEntry.createdAt)}
            </p>
          )}
        </div>

        {entries && entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download />
            Exportar
          </Button>
        )}
      </div>

      {entries && entries.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={action}
            onValueChange={(value) => setAction(value as AuditAction | typeof ALL)}
          >
            <SelectTrigger className="sm:w-[160px]">
              <SelectValue placeholder="Tipo de ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as ações</SelectItem>
              {AUDIT_ACTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {users.length > 1 && (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="sm:w-[190px]">
                <SelectValue placeholder="Usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os usuários</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="sm:w-[160px]"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="sm:w-[160px]"
          />
        </div>
      )}

      {isError && <ErrorState message="Não foi possível carregar o histórico." />}
      {!isError && isLoading && <LoadingState message="Carregando histórico..." />}
      {entries && entries.length === 0 && (
        <EmptyState icon={History} title="Nenhum evento registrado ainda" />
      )}
      {entries && entries.length > 0 && <HistoryTimeline entries={filtered} />}
    </div>
  );
}
