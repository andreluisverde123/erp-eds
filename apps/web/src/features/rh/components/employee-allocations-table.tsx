import { memo } from 'react';

import { MoreHorizontal, Trash2, UserRoundCog, UserRoundX } from 'lucide-react';
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

import type { EmployeeAllocation } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

interface EmployeeAllocationsTableProps {
  allocations: EmployeeAllocation[];
  onEnd: (allocation: EmployeeAllocation) => void;
  onDelete: (allocation: EmployeeAllocation) => void;
}

export const EmployeeAllocationsTable = memo(function EmployeeAllocationsTable({
  allocations,
  onEnd,
  onDelete,
}: EmployeeAllocationsTableProps) {
  if (allocations.length === 0) {
    return (
      <EmptyState
        icon={UserRoundCog}
        title="Nenhuma alocação encontrada"
        description="Vincule um funcionário a uma obra usando o formulário acima."
        className="min-h-[30vh]"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Funcionário</TableHead>
          <TableHead>Obra</TableHead>
          <TableHead>Centro de Custo</TableHead>
          <TableHead>Início</TableHead>
          <TableHead>Fim</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {allocations.map((allocation) => (
          <TableRow key={allocation.id}>
            <TableCell className="font-medium text-foreground">
              {allocation.employee.name}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {allocation.constructionSite.name}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {allocation.costCenter?.name ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(allocation.startDate)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {allocation.endDate ? formatDate(allocation.endDate) : '—'}
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
                  {!allocation.endDate && (
                    <DropdownMenuItem onClick={() => onEnd(allocation)}>
                      <UserRoundX />
                      Encerrar hoje
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(allocation)}>
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
