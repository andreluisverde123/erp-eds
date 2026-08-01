import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { useSuppliers } from '@/features/compras/hooks/use-suppliers';
import { AccountPayableStatusBadge } from '@/features/financeiro/components/account-payable-status-badge';
import { ACCOUNT_PAYABLE_STATUS_OPTIONS } from '@/features/financeiro/account-payable-status';
import type { AccountPayableStatus } from '@/features/financeiro/types';
import {
  ReportDataTable,
  type ReportColumn,
} from '@/features/relatorios/components/report-data-table';
import { useReport } from '@/features/relatorios/hooks/use-report';
import type { FinanceiroReportRow, ReportQuery } from '@/features/relatorios/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const columns: ReportColumn<FinanceiroReportRow>[] = [
  {
    key: 'supplier',
    label: 'Fornecedor',
    render: (row) => row.invoice.supplier.tradeName ?? row.invoice.supplier.legalName,
  },
  { key: 'document', label: 'Documento', render: (row) => row.invoice.number },
  {
    key: 'amount',
    label: 'Valor',
    sortKey: 'amount',
    align: 'right',
    render: (row) => formatCurrency(row.amount),
  },
  {
    key: 'dueDate',
    label: 'Vencimento',
    sortKey: 'dueDate',
    render: (row) => formatDate(row.dueDate),
  },
  {
    key: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (row) => <AccountPayableStatusBadge status={row.status as AccountPayableStatus} />,
  },
];

export function FinanceiroRelatorioSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountPayableStatus | typeof ALL>(ALL);
  const [supplierId, setSupplierId] = useState(ALL);
  const [query, setQuery] = useState<ReportQuery>({ page: 1, limit: PAGE_SIZE });
  const debouncedSearch = useDebouncedValue(search);

  function handleQueryChange(patch: Partial<ReportQuery>) {
    setQuery((current) => ({ ...current, ...patch }));
  }

  const effectiveQuery: ReportQuery = {
    ...query,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    supplierId: supplierId === ALL ? undefined : supplierId,
  };

  const { data, isLoading, isError } = useReport<FinanceiroReportRow>('financeiro', effectiveQuery);
  const { data: suppliersData } = useSuppliers({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Relatório Financeiro
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
            placeholder="Buscar por nota ou fornecedor"
            className="pl-8"
          />
        </div>

        <Select
          value={supplierId}
          onValueChange={(value) => {
            setSupplierId(value);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os fornecedores</SelectItem>
            {suppliersData?.data.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.tradeName ?? supplier.legalName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as AccountPayableStatus);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {ACCOUNT_PAYABLE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDataTable
        type="financeiro"
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        query={effectiveQuery}
        onQueryChange={handleQueryChange}
        emptyMessage="Nenhuma conta encontrada."
      />
    </div>
  );
}
