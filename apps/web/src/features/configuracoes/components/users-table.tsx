import { memo } from 'react';

import { KeyRound, MoreHorizontal, Pencil, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
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

import { UserStatusBadge } from './user-status-badge';
import type { User } from '../types';

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onResetPassword: (user: User) => void;
}

export const UsersTable = memo(function UsersTable({
  users,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: UsersTableProps) {
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
          <TableHead>Telefone</TableHead>
          <TableHead>Cargo</TableHead>
          <TableHead>Perfil</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium text-foreground">{user.name}</TableCell>
            <TableCell className="text-muted-foreground">{user.email}</TableCell>
            <TableCell className="text-muted-foreground">{user.phone ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{user.position ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">
              {user.roles.map((role) => role.name).join(', ') || '—'}
            </TableCell>
            <TableCell>
              <UserStatusBadge isActive={user.isActive} />
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(user)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onResetPassword(user)}>
                    <KeyRound />
                    Resetar senha
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
