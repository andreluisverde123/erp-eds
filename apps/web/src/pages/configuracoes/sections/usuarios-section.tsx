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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { ResetPasswordDialog } from '@/features/configuracoes/components/reset-password-dialog';
import { UserFormDrawer } from '@/features/configuracoes/components/user-form-drawer';
import { UsersTable } from '@/features/configuracoes/components/users-table';
import { useRoles } from '@/features/configuracoes/hooks/use-roles';
import { useUpdateUserStatus } from '@/features/configuracoes/hooks/use-user-mutations';
import { useUsers } from '@/features/configuracoes/hooks/use-users';
import { USER_STATUS_OPTIONS } from '@/features/configuracoes/user-status';
import type { User, UserStatus } from '@/features/configuracoes/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function UsuariosSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [roleId, setRoleId] = useState(ALL);
  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useUsers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
    roleId: roleId === ALL ? undefined : roleId,
  });

  const { data: rolesData } = useRoles({ limit: 100 });
  const statusMutation = useUpdateUserStatus();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);

  function openCreateDrawer() {
    setEditingUser(undefined);
    setDrawerOpen(true);
  }

  function openEditDrawer(user: User) {
    setEditingUser(user);
    setDrawerOpen(true);
  }

  function handleToggleStatus(user: User) {
    if (user.isActive) {
      setDeactivatingUser(user);
    } else {
      statusMutation.mutate({ id: user.id, isActive: true });
    }
  }

  async function confirmDeactivate() {
    if (!deactivatingUser) return;
    await statusMutation.mutateAsync({ id: deactivatingUser.id, isActive: false });
    setDeactivatingUser(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            Cadastro e controle de acesso dos usuários do sistema.
          </p>
        </div>
        <Button onClick={openCreateDrawer}>
          <Plus />
          Novo Usuário
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
          />
        </div>

        <Select value={roleId} onValueChange={resetPageAnd(setRoleId)}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os perfis</SelectItem>
            {rolesData?.data.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => resetPageAnd(setStatus)(value as UserStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {USER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && <ErrorState message="Não foi possível carregar os usuários. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando usuários..." />}

      {data && (
        <>
          <UsersTable
            users={data.data}
            onEdit={openEditDrawer}
            onToggleStatus={handleToggleStatus}
            onResetPassword={setResettingUser}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} usuários
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

      <UserFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} user={editingUser} />

      <ResetPasswordDialog
        user={resettingUser}
        onOpenChange={(open) => !open && setResettingUser(null)}
      />

      <ConfirmDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => !open && setDeactivatingUser(null)}
        title="Desativar usuário"
        description={`Tem certeza que deseja desativar "${deactivatingUser?.name}"? O usuário perderá acesso ao sistema imediatamente.`}
        confirmLabel="Desativar"
        variant="destructive"
        isLoading={statusMutation.isPending}
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}
