import { useState } from 'react';
import { Search } from 'lucide-react';
import {
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

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { PurchaseOrdersTable } from '@/features/compras/components/purchase-orders-table';
import { usePurchaseOrders } from '@/features/compras/hooks/use-purchase-orders';
import { PURCHASE_ORDER_STATUS_OPTIONS } from '@/features/compras/purchase-order-status';
import type { PurchaseOrderStatus } from '@/features/compras/types';

const PAGE_SIZE = 10;
const ALL_STATUS = 'ALL';

export function OrdensDeCompraPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | typeof ALL_STATUS>(ALL_STATUS);
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: PurchaseOrderStatus | typeof ALL_STATUS) {
    setStatus(value);
    setPage(1);
  }

  const { data, isLoading, isError } = usePurchaseOrders({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL_STATUS ? undefined : status,
  });

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ordens de Compra</h1>
        <p className="text-sm text-muted-foreground">
          Ordens emitidas a fornecedores a partir de solicitações aprovadas.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar por número ou fornecedor"
            className="pl-8"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => handleStatusChange(value as PurchaseOrderStatus)}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
            {PURCHASE_ORDER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar as ordens de compra. Tente novamente." />
      )}

      {!isError && isLoading && !data && <LoadingState message="Carregando ordens de compra..." />}

      {data && (
        <>
          <PurchaseOrdersTable orders={data.data} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} ordens
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
