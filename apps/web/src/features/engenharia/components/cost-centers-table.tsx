import { memo } from 'react';

import { MoreHorizontal, Pencil, Trash2, Wallet } from 'lucide-react';
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

import type { CostCenter } from '../types';

interface CostCentersTableProps {
  costCenters: CostCenter[];
  onEdit: (costCenter: CostCenter) => void;
  onDelete: (costCenter: CostCenter) => void;
}

export const CostCentersTable = memo(function CostCentersTable({
  costCenters,
  onEdit,
  onDelete,
}: CostCentersTableProps) {
  if (costCenters.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nenhum centro de custo cadastrado nesta obra."
        className="min-h-[30vh]"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {costCenters.map((costCenter) => (
          <TableRow key={costCenter.id}>
            <TableCell className="font-medium text-foreground">{costCenter.name}</TableCell>
            <TableCell className="text-muted-foreground">{costCenter.code}</TableCell>
            <TableCell className="text-muted-foreground">{costCenter.description ?? '—'}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(costCenter)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(costCenter)}>
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
