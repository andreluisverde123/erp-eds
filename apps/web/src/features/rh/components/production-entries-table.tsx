import { memo } from 'react';

import { Factory, MoreHorizontal, Trash2 } from 'lucide-react';
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

import type { ProductionEntry } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

interface ProductionEntriesTableProps {
  productionEntries: ProductionEntry[];
  onDelete: (productionEntry: ProductionEntry) => void;
}

export const ProductionEntriesTable = memo(function ProductionEntriesTable({
  productionEntries,
  onDelete,
}: ProductionEntriesTableProps) {
  if (productionEntries.length === 0) {
    return (
      <EmptyState
        icon={Factory}
        title="Nenhum apontamento de produção encontrado"
        description="Ajuste os filtros ou registre uma nova produção."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Funcionário</TableHead>
          <TableHead>Obra</TableHead>
          <TableHead>Serviço executado</TableHead>
          <TableHead className="text-right">Quantidade</TableHead>
          <TableHead>Data</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {productionEntries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium text-foreground">{entry.employee.name}</TableCell>
            <TableCell className="text-muted-foreground">{entry.constructionSite.name}</TableCell>
            <TableCell className="text-muted-foreground">{entry.description}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {entry.quantity} {entry.unit}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(entry.date)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(entry)}>
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
