import { memo } from 'react';

import { CheckCircle2, FileText, MoreHorizontal, Trash2, XCircle } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { InvoiceStatusBadge } from './invoice-status-badge';
import type { Invoice } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

interface InvoicesTableProps {
  invoices: Invoice[];
  onValidate: (invoice: Invoice) => void;
  onCancel: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

export const InvoicesTable = memo(function InvoicesTable({
  invoices,
  onValidate,
  onCancel,
  onDelete,
}: InvoicesTableProps) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhuma nota fiscal encontrada"
        description="Ajuste os filtros ou cadastre uma nova nota."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Ordem de Compra</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Emissão</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium text-foreground">
              {invoice.number}
              {invoice.series && <span className="text-muted-foreground">/{invoice.series}</span>}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {invoice.supplier.tradeName ?? invoice.supplier.legalName}
            </TableCell>
            <TableCell className="text-muted-foreground">{invoice.purchaseOrder.code}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(Number(invoice.totalAmount))}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(invoice.issueDate)}</TableCell>
            <TableCell>
              <InvoiceStatusBadge status={invoice.status} />
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
                  {invoice.status === 'RECEIVED' && (
                    <>
                      <DropdownMenuItem onClick={() => onValidate(invoice)}>
                        <CheckCircle2 />
                        Validar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onCancel(invoice)}>
                        <XCircle />
                        Cancelar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(invoice)}>
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
