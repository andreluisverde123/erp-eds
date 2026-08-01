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

import { RoleFormDrawer } from '@/features/configuracoes/components/role-form-drawer';
import { RolesTable } from '@/features/configuracoes/components/roles-table';
import { useDeleteRole } from '@/features/configuracoes/hooks/use-role-mutations';
import { useRoles } from '@/features/configuracoes/hooks/use-roles';
import type { Role } from '@/features/configuracoes/types';

const PAGE_SIZE = 10;

export function PerfisSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const { data, isLoading, isError } = useRoles({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const deleteMutation = useDeleteRole();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | undefined>();
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreateDrawer() {
    setEditingRole(undefined);
    setDrawerOpen(true);
  }

  function openEditDrawer(role: Role) {
    setEditingRole(role);
    setDrawerOpen(true);
  }

  function openDeleteDialog(role: Role) {
    setDeleteError(null);
    setDeletingRole(role);
  }

  async function confirmDelete() {
    if (!deletingRole) return;
    try {
      await deleteMutation.mutateAsync(deletingRole.id);
      setDeletingRole(null);
    } catch {
      setDeleteError('Não é possível excluir um perfil com usuários vinculados.');
    }
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Perfis</h2>
          <p className="text-sm text-muted-foreground">Perfis de acesso e suas permissões.</p>
        </div>
        <Button onClick={openCreateDrawer}>
          <Plus />
          Novo Perfil
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nome"
          className="pl-8"
        />
      </div>

      {isError && <ErrorState message="Não foi possível carregar os perfis. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando perfis..." />}

      {data && (
        <>
          <RolesTable roles={data.data} onEdit={openEditDrawer} onDelete={openDeleteDialog} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} perfis
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

      <RoleFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} role={editingRole} />

      <ConfirmDialog
        open={Boolean(deletingRole)}
        onOpenChange={(open) => !open && setDeletingRole(null)}
        title="Excluir perfil"
        description={
          deleteError ?? `Tem certeza que deseja excluir o perfil "${deletingRole?.name}"?`
        }
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
