import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  ErrorState,
  Input,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableSkeleton,
} from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { PaymentFormDrawer } from '@/features/financeiro/components/payment-form-drawer';
import { PaymentsTable } from '@/features/financeiro/components/payments-table';
import { usePayments } from '@/features/financeiro/hooks/use-payments';
import { PAYMENT_STATUS_OPTIONS } from '@/features/financeiro/payment-status';
import type { PaymentRecordStatus } from '@/features/financeiro/types';

const PAGE_SIZE = 10;
const ALL_STATUS = 'ALL';

export function PagamentosPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaymentRecordStatus | typeof ALL_STATUS>(ALL_STATUS);
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: PaymentRecordStatus | typeof ALL_STATUS) {
    setStatus(value);
    setPage(1);
  }

  const { data, isLoading, isError } = usePayments({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL_STATUS ? undefined : status,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pagamentos</h1>
          <p className="text-sm text-muted-foreground">
            Pagamentos registrados contra contas a pagar.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Registrar Pagamento
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar por nota ou fornecedor"
            className="pl-8"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => handleStatusChange(value as PaymentRecordStatus)}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
            {PAYMENT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os pagamentos. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando pagamentos..." />
      )}

      {data && (
        <>
          <PaymentsTable payments={data.data} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} pagamentos
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

      <PaymentFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
