import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import {
  ReportDataTable,
  type ReportColumn,
} from '@/features/relatorios/components/report-data-table';
import { useReport } from '@/features/relatorios/hooks/use-report';
import type { ReportQuery, RhReportRow } from '@/features/relatorios/types';
import { EmployeeStatusBadge } from '@/features/rh/components/employee-status-badge';
import { EMPLOYEE_STATUS_OPTIONS } from '@/features/rh/employee-status';
import type { EmployeeStatus } from '@/features/rh/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const columns: ReportColumn<RhReportRow>[] = [
  { key: 'name', label: 'Nome', sortKey: 'name', render: (row) => row.name },
  { key: 'position', label: 'Cargo', render: (row) => row.position },
  {
    key: 'site',
    label: 'Obra Atual',
    render: (row) => row.currentAllocation?.constructionSite.name ?? '—',
  },
  {
    key: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (row) => <EmployeeStatusBadge status={row.status as EmployeeStatus} />,
  },
  {
    key: 'hireDate',
    label: 'Admissão',
    sortKey: 'hireDate',
    render: (row) => formatDate(row.hireDate),
  },
];

export function RhRelatorioSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | typeof ALL>(ALL);
  const [constructionSiteId, setConstructionSiteId] = useState(ALL);
  const [query, setQuery] = useState<ReportQuery>({ page: 1, limit: PAGE_SIZE });
  const debouncedSearch = useDebouncedValue(search);

  function handleQueryChange(patch: Partial<ReportQuery>) {
    setQuery((current) => ({ ...current, ...patch }));
  }

  const effectiveQuery: ReportQuery = {
    ...query,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
  };

  const { data, isLoading, isError } = useReport<RhReportRow>('rh', effectiveQuery);
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Relatório de RH</h2>
        <p className="text-sm text-muted-foreground">Busca, filtros, ordenação e exportação.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              handleQueryChange({ page: 1 });
            }}
            placeholder="Buscar por nome, CPF ou cargo"
            className="pl-8"
          />
        </div>

        <Select
          value={constructionSiteId}
          onValueChange={(value) => {
            setConstructionSiteId(value);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as obras</SelectItem>
            {sitesData?.data.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as EmployeeStatus);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {EMPLOYEE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDataTable
        type="rh"
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        query={effectiveQuery}
        onQueryChange={handleQueryChange}
        emptyMessage="Nenhum funcionário encontrado."
      />
    </div>
  );
}
