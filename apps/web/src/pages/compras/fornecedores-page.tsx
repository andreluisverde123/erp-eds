import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  ErrorState,
  Input,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  TableSkeleton,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { SupplierFormDrawer } from '@/features/compras/components/supplier-form-drawer';
import { SuppliersTable } from '@/features/compras/components/suppliers-table';
import { useDeleteSupplier } from '@/features/compras/hooks/use-supplier-mutations';
import { useSuppliers } from '@/features/compras/hooks/use-suppliers';
import type { Supplier } from '@/features/compras/types';

const PAGE_SIZE = 10;

export function FornecedoresPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const { data, isLoading, isError } = useSuppliers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const deleteMutation = useDeleteSupplier();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>();
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  function openCreateDrawer() {
    setEditingSupplier(undefined);
    setDrawerOpen(true);
  }

  function openEditDrawer(supplier: Supplier) {
    setEditingSupplier(supplier);
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deletingSupplier) return;
    await deleteMutation.mutateAsync(deletingSupplier.id);
    setDeletingSupplier(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de fornecedores de materiais e serviços.
          </p>
        </div>
        <Button onClick={openCreateDrawer}>
          <Plus />
          Novo Fornecedor
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por razão social, fantasia ou CNPJ"
          className="pl-8"
        />
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os fornecedores. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={7} rows={PAGE_SIZE} message="Carregando fornecedores..." />
      )}

      {data && (
        <>
          <SuppliersTable
            suppliers={data.data}
            onEdit={openEditDrawer}
            onDelete={setDeletingSupplier}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} fornecedores
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

      <SupplierFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        supplier={editingSupplier}
      />

      <ConfirmDialog
        open={Boolean(deletingSupplier)}
        onOpenChange={(open) => !open && setDeletingSupplier(null)}
        title="Excluir fornecedor"
        description={`Tem certeza que deseja excluir "${deletingSupplier?.legalName}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
