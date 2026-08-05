import { useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
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

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { InboundInvoicesTable } from '@/features/conciliacao/components/inbound-invoices-table';
import { useCancelInboundInvoice } from '@/features/conciliacao/hooks/use-inbound-invoice-mutations';
import { useInboundInvoices } from '@/features/conciliacao/hooks/use-inbound-invoices';
import { INBOUND_INVOICE_STATUS_OPTIONS } from '@/features/conciliacao/inbound-invoice-status';
import { useSuppliers } from '@/features/compras/hooks/use-suppliers';
import type { InboundInvoice, InboundInvoiceStatus } from '@/features/conciliacao/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function ConciliacaoPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState(ALL);
  const [status, setStatus] = useState<InboundInvoiceStatus | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const debouncedSearch = useDebouncedValue(search);
  const debouncedMin = useDebouncedValue(amountMin);
  const debouncedMax = useDebouncedValue(amountMax);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useInboundInvoices({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    supplierId: supplierId === ALL ? undefined : supplierId,
    status: status === ALL ? undefined : status,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    // Campo vazio não é zero: sem esta guarda, apagar o filtro de valor
    // mínimo passaria a buscar "a partir de R$ 0,00" em vez de desligá-lo.
    amountMin: debouncedMin === '' ? undefined : Number(debouncedMin),
    amountMax: debouncedMax === '' ? undefined : Number(debouncedMax),
  });

  const { data: suppliersData } = useSuppliers({ page: 1, limit: 100 });
  const cancelMutation = useCancelInboundInvoice();

  const [cancellingInvoice, setCancellingInvoice] = useState<InboundInvoice | null>(null);

  async function confirmCancel() {
    if (!cancellingInvoice) return;
    await cancelMutation.mutateAsync(cancellingInvoice.id);
    setCancellingInvoice(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Conciliação de Notas
        </h1>
        <p className="text-sm text-muted-foreground">
          Notas fiscais recebidas aguardando vínculo com a ordem de compra. A conta a pagar só nasce
          depois da conciliação.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[240px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Número, fornecedor ou CNPJ"
            className="pl-8"
          />
        </div>

        <Select value={supplierId} onValueChange={resetPageAnd(setSupplierId)}>
          <SelectTrigger className="sm:w-[200px]">
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
          onValueChange={(value) => resetPageAnd(setStatus)(value as InboundInvoiceStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {INBOUND_INVOICE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => resetPageAnd(setDateFrom)(event.target.value)}
            className="sm:w-[150px]"
            aria-label="Emissão de"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => resetPageAnd(setDateTo)(event.target.value)}
            className="sm:w-[150px]"
            aria-label="Emissão até"
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amountMin}
            onChange={(event) => resetPageAnd(setAmountMin)(event.target.value)}
            placeholder="Valor mín."
            className="sm:w-[130px]"
            aria-label="Valor mínimo"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amountMax}
            onChange={(event) => resetPageAnd(setAmountMax)(event.target.value)}
            placeholder="Valor máx."
            className="sm:w-[130px]"
            aria-label="Valor máximo"
          />
        </div>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar as notas fiscais. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={7} rows={PAGE_SIZE} message="Carregando notas fiscais..." />
      )}

      {data && (
        <>
          <InboundInvoicesTable
            invoices={data.data}
            onOpen={(invoice) => navigate(`/financeiro/conciliacao/${invoice.id}`)}
            onCancel={setCancellingInvoice}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} notas
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

      <ConfirmDialog
        open={Boolean(cancellingInvoice)}
        onOpenChange={(open) => !open && setCancellingInvoice(null)}
        title="Cancelar nota fiscal"
        description={`A nota ${cancellingInvoice?.number ?? ''} sai da fila de conciliação e não gerará conta a pagar. Use para nota indevida, duplicada ou devolvida.`}
        confirmLabel="Cancelar nota"
        loadingLabel="Cancelando..."
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
