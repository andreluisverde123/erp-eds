import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { ConstructionSiteStatusBadge } from '@/features/engenharia/components/construction-site-status-badge';
import { CONSTRUCTION_STATUS_OPTIONS } from '@/features/engenharia/construction-site-status';
import type { ConstructionStatus } from '@/features/engenharia/types';
import {
  ReportDataTable,
  type ReportColumn,
} from '@/features/relatorios/components/report-data-table';
import { useReport } from '@/features/relatorios/hooks/use-report';
import type { ObraReportRow, ReportQuery } from '@/features/relatorios/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatCurrency(value: string | null): string {
  if (!value) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const columns: ReportColumn<ObraReportRow>[] = [
  { key: 'code', label: 'Código', sortKey: 'code', render: (row) => row.code },
  { key: 'name', label: 'Nome', sortKey: 'name', render: (row) => row.name },
  { key: 'clientName', label: 'Cliente', render: (row) => row.clientName ?? '—' },
  {
    key: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (row) => <ConstructionSiteStatusBadge status={row.status as ConstructionStatus} />,
  },
  {
    key: 'city',
    label: 'Cidade/UF',
    render: (row) => (row.city ? `${row.city}${row.state ? `/${row.state}` : ''}` : '—'),
  },
  {
    key: 'startDate',
    label: 'Início',
    sortKey: 'startDate',
    render: (row) => formatDate(row.startDate),
  },
  {
    key: 'expectedEndDate',
    label: 'Previsão Fim',
    sortKey: 'expectedEndDate',
    render: (row) => formatDate(row.expectedEndDate),
  },
  {
    key: 'budgetAmount',
    label: 'Orçamento',
    sortKey: 'budgetAmount',
    align: 'right',
    render: (row) => formatCurrency(row.budgetAmount),
  },
];

export function ObrasRelatorioSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ConstructionStatus | typeof ALL>(ALL);
  const [city, setCity] = useState('');
  const [query, setQuery] = useState<ReportQuery>({ page: 1, limit: PAGE_SIZE });
  const debouncedSearch = useDebouncedValue(search);
  const debouncedCity = useDebouncedValue(city);

  function handleQueryChange(patch: Partial<ReportQuery>) {
    setQuery((current) => ({ ...current, ...patch }));
  }

  const effectiveQuery: ReportQuery = {
    ...query,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    city: debouncedCity || undefined,
  };

  const { data, isLoading, isError } = useReport<ObraReportRow>('obras', effectiveQuery);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Relatório de Obras</h2>
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
            placeholder="Buscar por código, nome ou cliente"
            className="pl-8"
          />
        </div>

        <Input
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            handleQueryChange({ page: 1 });
          }}
          placeholder="Cidade"
          className="sm:w-[160px]"
        />

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as ConstructionStatus);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CONSTRUCTION_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDataTable
        type="obras"
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        query={effectiveQuery}
        onQueryChange={handleQueryChange}
        emptyMessage="Nenhuma obra encontrada."
      />
    </div>
  );
}
