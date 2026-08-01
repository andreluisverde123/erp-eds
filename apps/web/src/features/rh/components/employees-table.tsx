import { memo } from 'react';

import { MoreHorizontal, Pencil, Trash2, UserRound } from 'lucide-react';
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

import { EmployeeStatusBadge } from './employee-status-badge';
import type { Employee } from '../types';

function formatCpf(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
}

export const EmployeesTable = memo(function EmployeesTable({
  employees,
  onEdit,
  onDelete,
}: EmployeesTableProps) {
  if (employees.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="Nenhum funcionário encontrado"
        description="Ajuste os filtros ou cadastre um novo funcionário."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Cargo</TableHead>
          <TableHead>CPF</TableHead>
          <TableHead>Obra Atual</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => (
          <TableRow key={employee.id}>
            <TableCell className="font-medium text-foreground">{employee.name}</TableCell>
            <TableCell className="text-muted-foreground">{employee.position}</TableCell>
            <TableCell className="text-muted-foreground">{formatCpf(employee.cpf)}</TableCell>
            <TableCell className="text-muted-foreground">
              {employee.currentAllocation?.constructionSite.name ?? '—'}
            </TableCell>
            <TableCell>
              <EmployeeStatusBadge status={employee.status} />
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
                  <DropdownMenuItem onClick={() => onEdit(employee)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(employee)}>
                    <Trash2 />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
