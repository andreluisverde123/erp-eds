import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
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

import { SystemUsersTable } from '@/features/administracao/components/system-users-table';
import { useRoleOptions } from '@/features/administracao/hooks/use-role-options';
import { useUpdateSystemUserStatus } from '@/features/administracao/hooks/use-system-user-mutations';
import { useSystemUsers } from '@/features/administracao/hooks/use-system-users';
import { USER_STATUS_OPTIONS } from '@/features/administracao/user-status';
import type { SystemUser, UserStatus } from '@/features/administracao/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function UsuariosPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(ALL);
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const debouncedName = useDebouncedValue(name);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useSystemUsers({
    page,
    limit: PAGE_SIZE,
    name: debouncedName || undefined,
    roleId: roleId === ALL ? undefined : roleId,
    status: status === ALL ? undefined : status,
  });

  const { data: rolesData } = useRoleOptions();
  const statusMutation = useUpdateSystemUserStatus();

  const [deactivatingUser, setDeactivatingUser] = useState<SystemUser | null>(null);

  function handleToggleStatus(user: SystemUser) {
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Quem tem acesso ao sistema, com qual perfil e em que situação.
          </p>
        </div>
        <Button onClick={() => navigate('/administracao/usuarios/novo')}>
          <Plus />
          Novo Usuário
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={name}
            onChange={(event) => resetPageAnd(setName)(event.target.value)}
            placeholder="Buscar por nome"
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

      {!isError && isLoading && !data && (
        <TableSkeleton columns={8} rows={PAGE_SIZE} message="Carregando usuários..." />
      )}

      {data && (
        <>
          <SystemUsersTable
            users={data.data}
            onView={(user) => navigate(`/administracao/usuarios/${user.id}`)}
            onEdit={(user) => navigate(`/administracao/usuarios/${user.id}/editar`)}
            onToggleStatus={handleToggleStatus}
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

      <ConfirmDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => !open && setDeactivatingUser(null)}
        title="Desativar usuário"
        description={`Tem certeza que deseja desativar "${deactivatingUser?.name}"? O usuário perderá acesso ao sistema imediatamente.`}
        confirmLabel="Desativar"
        loadingLabel="Desativando..."
        variant="destructive"
        isLoading={statusMutation.isPending}
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}
