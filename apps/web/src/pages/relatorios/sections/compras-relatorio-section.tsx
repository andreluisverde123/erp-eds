import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { PurchaseOrderStatusBadge } from '@/features/compras/components/purchase-order-status-badge';
import { useSuppliers } from '@/features/compras/hooks/use-suppliers';
import { PURCHASE_ORDER_STATUS_OPTIONS } from '@/features/compras/purchase-order-status';
import type { PurchaseOrderStatus } from '@/features/compras/types';
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import {
  ReportDataTable,
  type ReportColumn,
} from '@/features/relatorios/components/report-data-table';
import { useReport } from '@/features/relatorios/hooks/use-report';
import type { CompraReportRow, ReportQuery } from '@/features/relatorios/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const columns: ReportColumn<CompraReportRow>[] = [
  { key: 'code', label: 'Número', sortKey: 'code', render: (row) => row.code },
  {
    key: 'supplier',
    label: 'Fornecedor',
    render: (row) => row.supplier.tradeName ?? row.supplier.legalName,
  },
  { key: 'site', label: 'Obra', render: (row) => row.constructionSite.name },
  {
    key: 'totalAmount',
    label: 'Valor',
    sortKey: 'totalAmount',
    align: 'right',
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    key: 'issueDate',
    label: 'Emissão',
    sortKey: 'issueDate',
    render: (row) => formatDate(row.issueDate),
  },
  {
    key: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (row) => <PurchaseOrderStatusBadge status={row.status as PurchaseOrderStatus} />,
  },
];

export function ComprasRelatorioSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | typeof ALL>(ALL);
  const [supplierId, setSupplierId] = useState(ALL);
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
    supplierId: supplierId === ALL ? undefined : supplierId,
    constructionSiteId: constructionSiteId === ALL ? undefined : constructionSiteId,
  };

  const { data, isLoading, isError } = useReport<CompraReportRow>('compras', effectiveQuery);
  const { data: suppliersData } = useSuppliers({ limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Relatório de Compras
        </h2>
        <p className="text-sm text-muted-foreground">Busca, filtros, ordenação e exportação.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[200px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              handleQueryChange({ page: 1 });
            }}
            placeholder="Buscar por número ou fornecedor"
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
            setStatus(value as PurchaseOrderStatus);
            handleQueryChange({ page: 1 });
          }}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {PURCHASE_ORDER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportDataTable
        type="compras"
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        query={effectiveQuery}
        onQueryChange={handleQueryChange}
        emptyMessage="Nenhuma ordem de compra encontrada."
      />
    </div>
  );
}
