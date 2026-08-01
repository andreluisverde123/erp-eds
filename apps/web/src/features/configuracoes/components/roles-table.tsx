import { memo } from 'react';

import { MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge,
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

import type { Role } from '../types';

interface RolesTableProps {
  roles: Role[];
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export const RolesTable = memo(function RolesTable({ roles, onEdit, onDelete }: RolesTableProps) {
  if (roles.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nenhum perfil encontrado"
        description="Ajuste a busca ou cadastre um novo perfil."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="text-right">Permissões</TableHead>
          <TableHead className="text-right">Usuários</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow key={role.id}>
            <TableCell className="font-medium text-foreground">
              <div className="flex items-center gap-2">
                {role.name}
                {role.isSystem && <Badge variant="outline">Sistema</Badge>}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{role.description ?? '—'}</TableCell>
            <TableCell className="text-right">
              <Badge variant="secondary">{role.permissionCodes.length}</Badge>
            </TableCell>
            <TableCell className="text-right text-muted-foreground">{role.userCount}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(role)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  {!role.isSystem && (
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(role)}>
                      <Trash2 />
                      Excluir
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
