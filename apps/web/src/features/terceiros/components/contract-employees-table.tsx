import { memo } from 'react';

import { HardHat, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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

import type { ContractEmployee } from '../types';

interface ContractEmployeesTableProps {
  employees: ContractEmployee[];
  onEdit: (employee: ContractEmployee) => void;
  onDelete: (employee: ContractEmployee) => void;
}

export const ContractEmployeesTable = memo(function ContractEmployeesTable({
  employees,
  onEdit,
  onDelete,
}: ContractEmployeesTableProps) {
  if (employees.length === 0) {
    return (
      <EmptyState
        icon={HardHat}
        title="Nenhum funcionário terceirizado encontrado"
        description="Ajuste os filtros ou cadastre um novo funcionário."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Função</TableHead>
          <TableHead>Obra</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => (
          <TableRow key={employee.id}>
            <TableCell className="font-medium text-foreground">{employee.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {employee.contract.contractor.tradeName ?? employee.contract.contractor.legalName}
            </TableCell>
            <TableCell className="text-muted-foreground">{employee.role}</TableCell>
            <TableCell className="text-muted-foreground">
              {employee.contract.constructionSite?.name ?? '—'}
            </TableCell>
            <TableCell>
              <Badge variant={employee.isActive ? 'success' : 'secondary'}>
                {employee.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
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
