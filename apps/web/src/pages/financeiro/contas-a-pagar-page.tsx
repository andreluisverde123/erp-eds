import { useState } from 'react';
import {
  ErrorState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  TableSkeleton,
} from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSuppliers } from '@/features/compras/hooks/use-suppliers';

import {
  AccountPayablesFilters,
  ALL_STATUS,
  ALL_SUPPLIERS,
} from '@/features/financeiro/components/account-payables-filters';
import { AccountPayablesSummaryCards } from '@/features/financeiro/components/account-payables-summary-cards';
import { AccountPayablesTable } from '@/features/financeiro/components/account-payables-table';
import { PaymentFormDrawer } from '@/features/financeiro/components/payment-form-drawer';
import { useAccountPayables } from '@/features/financeiro/hooks/use-account-payables';
import { useAccountPayableSummary } from '@/features/financeiro/hooks/use-account-payable-summary';
import type { AccountPayable, AccountPayableStatus } from '@/features/financeiro/types';

const PAGE_SIZE = 10;

export function ContasAPagarPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountPayableStatus | typeof ALL_STATUS>(ALL_STATUS);
  const [supplierId, setSupplierId] = useState(ALL_SUPPLIERS);
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const handleSearchChange = resetPageAnd(setSearch);
  const handleStatusChange = resetPageAnd(setStatus);
  const handleSupplierIdChange = resetPageAnd(setSupplierId);
  const handleDueDateFromChange = resetPageAnd(setDueDateFrom);
  const handleDueDateToChange = resetPageAnd(setDueDateTo);

  const debouncedSearch = useDebouncedValue(search);

  const { data: summary } = useAccountPayableSummary();
  const { data: suppliersData } = useSuppliers({ limit: 100 });

  const { data, isLoading, isError } = useAccountPayables({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL_STATUS ? undefined : status,
    supplierId: supplierId === ALL_SUPPLIERS ? undefined : supplierId,
    dueDateFrom: dueDateFrom || undefined,
    dueDateTo: dueDateTo || undefined,
  });

  const [payingAccount, setPayingAccount] = useState<AccountPayable | null>(null);

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">
          Parcelas geradas a partir de notas fiscais validadas.
        </p>
      </div>

      {summary && <AccountPayablesSummaryCards summary={summary} />}

      <AccountPayablesFilters
        search={search}
        onSearchChange={handleSearchChange}
        status={status}
        onStatusChange={handleStatusChange}
        supplierId={supplierId}
        onSupplierIdChange={handleSupplierIdChange}
        suppliers={suppliersData?.data ?? []}
        dueDateFrom={dueDateFrom}
        onDueDateFromChange={handleDueDateFromChange}
        dueDateTo={dueDateTo}
        onDueDateToChange={handleDueDateToChange}
      />

      {isError && (
        <ErrorState message="Não foi possível carregar as contas a pagar. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando contas a pagar..." />
      )}

      {data && (
        <>
          <AccountPayablesTable accounts={data.data} onRegisterPayment={setPayingAccount} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} contas
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

      <PaymentFormDrawer
        open={Boolean(payingAccount)}
        onOpenChange={(open) => !open && setPayingAccount(null)}
        accountPayable={payingAccount ?? undefined}
      />
    </div>
  );
}
