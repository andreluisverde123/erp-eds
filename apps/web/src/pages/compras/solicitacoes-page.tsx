import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  Button,
  ErrorState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  TableSkeleton,
} from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { useAuth } from '@/features/auth/context';

import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';

import {
  ALL_COST_CENTERS,
  ALL_STATUS,
  PurchaseRequestsFilters,
} from '@/features/compras/components/purchase-requests-filters';
import { PurchaseRequestsTable } from '@/features/compras/components/purchase-requests-table';
import { usePurchaseRequests } from '@/features/compras/hooks/use-purchase-requests';
import type { PurchaseRequestStatus } from '@/features/compras/types';

const PAGE_SIZE = 10;

interface SolicitacoesPageProps {
  /// Quando definido, trava o filtro de status (usado por /compras/pendentes)
  /// e some com o botão de criação — essa tela vira só uma visão de leitura.
  fixedStatus?: PurchaseRequestStatus;
  title?: string;
  description?: string;
}

export function SolicitacoesPage({
  fixedStatus,
  title = 'Solicitações',
  description = 'Acompanhe as solicitações de compra por centro de custo.',
}: SolicitacoesPageProps) {
  const navigate = useNavigate();
  // Mesma permissão que a API exige em POST /purchase-requests: quem pede é a
  // Engenharia (`compras.request`), não só o setor de Compras.
  const { user } = useAuth();
  const canCreate = user?.permissions.includes('compras.request') ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseRequestStatus | typeof ALL_STATUS>(
    fixedStatus ?? ALL_STATUS,
  );
  const [costCenterId, setCostCenterId] = useState(ALL_COST_CENTERS);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const handleSearchChange = resetPageAnd(setSearch);
  const handleStatusChange = resetPageAnd(setStatus);
  const handleCostCenterIdChange = resetPageAnd(setCostCenterId);
  const handleDateFromChange = resetPageAnd(setDateFrom);
  const handleDateToChange = resetPageAnd(setDateTo);

  const { data: costCentersData } = useCostCenters({ limit: 100 });

  const { data, isLoading, isError } = usePurchaseRequests({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: fixedStatus ?? (status === ALL_STATUS ? undefined : status),
    costCenterId: costCenterId === ALL_COST_CENTERS ? undefined : costCenterId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {!fixedStatus && canCreate && (
          <Button onClick={() => navigate('/engenharia/solicitacoes/nova')}>
            <Plus />
            Nova Solicitação
          </Button>
        )}
      </div>

      <PurchaseRequestsFilters
        search={search}
        onSearchChange={handleSearchChange}
        status={fixedStatus ?? status}
        onStatusChange={handleStatusChange}
        hideStatusFilter={Boolean(fixedStatus)}
        costCenterId={costCenterId}
        onCostCenterIdChange={handleCostCenterIdChange}
        costCenters={costCentersData?.data ?? []}
        dateFrom={dateFrom}
        onDateFromChange={handleDateFromChange}
        dateTo={dateTo}
        onDateToChange={handleDateToChange}
      />

      {isError && (
        <ErrorState message="Não foi possível carregar as solicitações. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando solicitações..." />
      )}

      {data && (
        <>
          <PurchaseRequestsTable requests={data.data} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} solicitações
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
