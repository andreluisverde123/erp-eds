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

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { InvoiceFormDrawer } from '@/features/financeiro/components/invoice-form-drawer';
import { InvoicesTable } from '@/features/financeiro/components/invoices-table';
import { useInvoices } from '@/features/financeiro/hooks/use-invoices';
import {
  useDeleteInvoice,
  useUpdateInvoiceStatus,
} from '@/features/financeiro/hooks/use-invoice-mutations';
import { INVOICE_STATUS_OPTIONS } from '@/features/financeiro/invoice-status';
import type { Invoice, InvoiceStatus } from '@/features/financeiro/types';

const PAGE_SIZE = 10;
const ALL_STATUS = 'ALL';

export function NotasFiscaisPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | typeof ALL_STATUS>(ALL_STATUS);
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: InvoiceStatus | typeof ALL_STATUS) {
    setStatus(value);
    setPage(1);
  }

  const { data, isLoading, isError } = useInvoices({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL_STATUS ? undefined : status,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [validatingInvoice, setValidatingInvoice] = useState<Invoice | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);

  const validateMutation = useUpdateInvoiceStatus(validatingInvoice?.id ?? '');
  const cancelMutation = useUpdateInvoiceStatus(cancellingInvoice?.id ?? '');
  const deleteMutation = useDeleteInvoice();

  async function confirmValidate() {
    if (!validatingInvoice) return;
    await validateMutation.mutateAsync('VALIDATED');
    setValidatingInvoice(null);
  }

  async function confirmCancel() {
    if (!cancellingInvoice) return;
    await cancelMutation.mutateAsync('CANCELLED');
    setCancellingInvoice(null);
  }

  async function confirmDelete() {
    if (!deletingInvoice) return;
    await deleteMutation.mutateAsync(deletingInvoice.id);
    setDeletingInvoice(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notas Fiscais</h1>
          <p className="text-sm text-muted-foreground">
            Notas recebidas de fornecedores, vinculadas a ordens de compra.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Nova Nota
        </Button>
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
          onValueChange={(value) => handleStatusChange(value as InvoiceStatus)}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
            {INVOICE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar as notas fiscais. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={7} rows={PAGE_SIZE} message="Carregando notas fiscais..." />
      )}

      {data && (
        <>
          <InvoicesTable
            invoices={data.data}
            onValidate={setValidatingInvoice}
            onCancel={setCancellingInvoice}
            onDelete={setDeletingInvoice}
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

      <InvoiceFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <ConfirmDialog
        open={Boolean(validatingInvoice)}
        onOpenChange={(open) => !open && setValidatingInvoice(null)}
        title="Validar nota fiscal"
        description={`Validar "${validatingInvoice?.number}" gera automaticamente a conta a pagar correspondente (vencimento em 30 dias). Confirmar?`}
        confirmLabel="Validar"
        isLoading={validateMutation.isPending}
        onConfirm={confirmValidate}
      />

      <ConfirmDialog
        open={Boolean(cancellingInvoice)}
        onOpenChange={(open) => !open && setCancellingInvoice(null)}
        title="Cancelar nota fiscal"
        description={`Tem certeza que deseja cancelar "${cancellingInvoice?.number}"?`}
        confirmLabel="Cancelar nota"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={confirmCancel}
      />

      <ConfirmDialog
        open={Boolean(deletingInvoice)}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
        title="Excluir nota fiscal"
        description={`Tem certeza que deseja excluir "${deletingInvoice?.number}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
