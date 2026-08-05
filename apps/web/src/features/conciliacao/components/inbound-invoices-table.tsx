import { memo } from 'react';

import { Ban, FileCheck2, FileText, MoreHorizontal } from 'lucide-react';
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

import { InboundInvoiceStatusBadge } from './inbound-invoice-status-badge';
import { formatAmount, formatDate, formatDocument } from '../format';
import type { InboundInvoice } from '../types';

interface InboundInvoicesTableProps {
  invoices: InboundInvoice[];
  onOpen: (invoice: InboundInvoice) => void;
  onCancel: (invoice: InboundInvoice) => void;
}

export const InboundInvoicesTable = memo(function InboundInvoicesTable({
  invoices,
  onOpen,
  onCancel,
}: InboundInvoicesTableProps) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhuma nota fiscal encontrada"
        description="Ajuste os filtros ou lance uma nota manualmente."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>Valor Total</TableHead>
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
              {invoice.series && <span className="text-muted-foreground"> / {invoice.series}</span>}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {/* O nome do CADASTRO quando o CNPJ casou; o do documento quando
                  não casou. Nos dois casos é o nome que identifica o emitente
                  para quem está olhando a fila. */}
              {invoice.supplier?.tradeName ?? invoice.supplier?.legalName ?? invoice.supplierName}
              {/* Amber cru, as mesmas classes da variante `warning` do Badge:
                  o sistema não tem token `--warning`, e criar um seria mexer
                  no Design System. */}
              {!invoice.supplier && (
                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                  não cadastrado
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatDocument(invoice.supplierDocument)}
            </TableCell>
            <TableCell className="tabular-nums text-foreground">
              {formatAmount(invoice.totalAmount)}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatDate(invoice.issueDate)}
            </TableCell>
            <TableCell>
              <InboundInvoiceStatusBadge status={invoice.status} />
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
                  <DropdownMenuItem onClick={() => onOpen(invoice)}>
                    <FileCheck2 />
                    {invoice.status === 'PENDING' ? 'Conciliar' : 'Ver conciliação'}
                  </DropdownMenuItem>
                  {invoice.status === 'PENDING' && (
                    <DropdownMenuItem variant="destructive" onClick={() => onCancel(invoice)}>
                      <Ban />
                      Cancelar nota
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
