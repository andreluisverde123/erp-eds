import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  ErrorState,
  Input,
  LoadingState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { PayslipFormDrawer } from '@/features/rh/components/payslip-form-drawer';
import { PayslipsTable } from '@/features/rh/components/payslips-table';
import { useDeletePayslip } from '@/features/rh/hooks/use-payslip-mutations';
import { usePayslips } from '@/features/rh/hooks/use-payslips';
import type { Payslip } from '@/features/rh/types';

const PAGE_SIZE = 10;

export function HoleritesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const { data, isLoading, isError } = usePayslips({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const deleteMutation = useDeletePayslip();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingPayslip, setDeletingPayslip] = useState<Payslip | null>(null);

  async function confirmDelete() {
    if (!deletingPayslip) return;
    await deleteMutation.mutateAsync(deletingPayslip.id);
    setDeletingPayslip(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Holerites</h1>
          <p className="text-sm text-muted-foreground">Holerites mensais dos funcionários.</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Novo Holerite
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nome ou CPF"
          className="pl-8"
        />
      </div>

      {isError && <ErrorState message="Não foi possível carregar os holerites. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando holerites..." />}

      {data && (
        <>
          <PayslipsTable payslips={data.data} onDelete={setDeletingPayslip} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} holerites
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

      <PayslipFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <ConfirmDialog
        open={Boolean(deletingPayslip)}
        onOpenChange={(open) => !open && setDeletingPayslip(null)}
        title="Excluir holerite"
        description={`Tem certeza que deseja excluir o holerite de "${deletingPayslip?.employee.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
