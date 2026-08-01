import { memo } from 'react';

import { MoreHorizontal, Pencil, Trash2, Truck } from 'lucide-react';
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

import type { Supplier } from '../types';

interface SuppliersTableProps {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}

export const SuppliersTable = memo(function SuppliersTable({
  suppliers,
  onEdit,
  onDelete,
}: SuppliersTableProps) {
  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="Nenhum fornecedor encontrado"
        description="Ajuste a busca ou cadastre um novo fornecedor."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fornecedor</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>Contato</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{supplier.legalName}</span>
                {supplier.tradeName && (
                  <span className="text-xs text-muted-foreground">{supplier.tradeName}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{supplier.document}</TableCell>
            <TableCell className="text-muted-foreground">{supplier.contactName ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{supplier.phone ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{supplier.email ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">
              {supplier.city
                ? `${supplier.city}${supplier.state ? `, ${supplier.state}` : ''}`
                : '—'}
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
                  <DropdownMenuItem onClick={() => onEdit(supplier)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(supplier)}>
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
