import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import {
  ReportDataTable,
  type ReportColumn,
} from '@/features/relatorios/components/report-data-table';
import { useReport } from '@/features/relatorios/hooks/use-report';
import type { ReportQuery, TerceirosReportRow } from '@/features/relatorios/types';
import { ContractorStatusBadge } from '@/features/terceiros/components/contractor-status-badge';
import { CONTRACTOR_STATUS_OPTIONS } from '@/features/terceiros/contractor-status';
import type { ContractorStatus } from '@/features/terceiros/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

const columns: ReportColumn<TerceirosReportRow>[] = [
  { key: 'legalName', label: 'Razão Social', sortKey: 'legalName', render: (row) => row.legalName },
  { key: 'document', label: 'CNPJ', render: (row) => row.document },
  { key: 'responsibleName', label: 'Responsável', render: (row) => row.responsibleName ?? '—' },
  {
    key: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (row) => <ContractorStatusBadge status={row.status as ContractorStatus} />,
  },
  {
    key: 'contracts',
    label: 'Contratos',
    align: 'right',
    render: (row) => String(row._count.contracts),
  },
];

export function TerceirosRelatorioSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractorStatus | typeof ALL>(ALL);
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

  const { data, isLoading, isError } = useReport<TerceirosReportRow>('terceiros', effectiveQuery);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Relatório de Terceirizados
        </h2>
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
            placeholder="Buscar por razão social, fantasia ou CNPJ"
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
            setStatus(value as ContractorStatus);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CONTRACTOR_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDataTable
        type="terceiros"
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        query={effectiveQuery}
        onQueryChange={handleQueryChange}
        emptyMessage="Nenhuma empresa terceirizada encontrada."
      />
    </div>
  );
}
