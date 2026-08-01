import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Button,
  ErrorState,
  Input,
  LoadingState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { exportToCsv } from '@/lib/csv-export';

import { AuditLogsTable } from '@/features/configuracoes/components/audit-logs-table';
import { useAuditLogModules, useAuditLogs } from '@/features/configuracoes/hooks/use-audit-logs';
import { useUsers } from '@/features/configuracoes/hooks/use-users';
import { AUDIT_ACTION_OPTIONS, getAuditActionLabel } from '@/features/configuracoes/audit-action';
import { getModuleForEntityType } from '@/features/configuracoes/audit-log-entity-modules';
import { getModuleLabel } from '@/features/configuracoes/permission-modules';
import type { AuditAction, AuditLogEntry } from '@/features/configuracoes/types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const PAGE_SIZE = 15;
const ALL = 'ALL';

export function AuditoriaSection() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [action, setAction] = useState<AuditAction | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    userId: userId === ALL ? undefined : userId,
    module: module === ALL ? undefined : module,
    action: action === ALL ? undefined : action,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: usersData } = useUsers({ limit: 100 });
  const { data: modules } = useAuditLogModules();

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  function handleExport() {
    if (!data) return;
    exportToCsv(
      'auditoria.csv',
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
          key: 'module',
          label: 'Módulo',
          value: (row: AuditLogEntry) => getModuleLabel(getModuleForEntityType(row.entityType)),
        },
        {
          key: 'action',
          label: 'Ação',
          value: (row: AuditLogEntry) => getAuditActionLabel(row.action),
        },
        {
          key: 'entity',
          label: 'Registro afetado',
          value: (row: AuditLogEntry) => `${row.entityType} #${row.entityId.slice(0, 8)}`,
        },
        { key: 'ip', label: 'IP', value: (row: AuditLogEntry) => row.ipAddress ?? '' },
      ],
      data.data,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Auditoria</h2>
          <p className="text-sm text-muted-foreground">
            Trilha de eventos do sistema — somente leitura.
          </p>
        </div>
        {data && data.data.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download />
            Exportar página atual
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={userId} onValueChange={resetPageAnd(setUserId)}>
          <SelectTrigger className="sm:w-[190px]">
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os usuários</SelectItem>
            {usersData?.data.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={module} onValueChange={resetPageAnd(setModule)}>
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os módulos</SelectItem>
            {modules?.map((moduleKey) => (
              <SelectItem key={moduleKey} value={moduleKey}>
                {getModuleLabel(moduleKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={action}
          onValueChange={(value) => resetPageAnd(setAction)(value as AuditAction)}
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

        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => resetPageAnd(setDateFrom)(event.target.value)}
          className="sm:w-[160px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => resetPageAnd(setDateTo)(event.target.value)}
          className="sm:w-[160px]"
        />
      </div>

      {isError && <ErrorState message="Não foi possível carregar a auditoria. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando auditoria..." />}

      {data && (
        <>
          <AuditLogsTable logs={data.data} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} eventos
              </p>
              <div className="flex items-center gap-2">
                <PaginationPrevious
                  disabled={meta.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                />
                <PaginationNext
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
                />
              </div>
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}
