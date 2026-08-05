import { memo } from 'react';

import { Eye, MoreHorizontal, Pencil, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { SystemUserStatusBadge } from './system-user-status-badge';
import type { SystemUser } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : 'Nunca acessou';
}

interface SystemUsersTableProps {
  users: SystemUser[];
  onView: (user: SystemUser) => void;
  onEdit: (user: SystemUser) => void;
  onToggleStatus: (user: SystemUser) => void;
}

export const SystemUsersTable = memo(function SystemUsersTable({
  users,
  onView,
  onEdit,
  onToggleStatus,
}: SystemUsersTableProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum usuário encontrado"
        description="Ajuste os filtros ou cadastre um novo usuário."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>Perfil</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Último acesso</TableHead>
          <TableHead>Criado em</TableHead>
          <TableHead>Criado por</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium text-foreground">{user.name}</TableCell>
            <TableCell className="text-muted-foreground">{user.email}</TableCell>
            <TableCell className="text-muted-foreground">
              {user.roles.map((role) => role.name).join(', ') || '—'}
            </TableCell>
            <TableCell>
              <SystemUserStatusBadge status={user.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(user.lastAccessAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
            <TableCell className="text-muted-foreground">{user.createdBy?.name ?? '—'}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(user)}>
                    <Eye />
                    Visualizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(user)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  {user.isActive ? (
                    <DropdownMenuItem variant="destructive" onClick={() => onToggleStatus(user)}>
                      <UserRoundX />
                      Desativar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onToggleStatus(user)}>
                      <UserRoundCheck />
                      Ativar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
