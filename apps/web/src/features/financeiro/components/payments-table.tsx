import { memo } from 'react';

import { CreditCard } from 'lucide-react';
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { PaymentStatusBadge } from './payment-status-badge';
import type { Payment } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export const PaymentsTable = memo(function PaymentsTable({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhum pagamento encontrado"
        description="Ajuste os filtros ou registre um novo pagamento."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Forma de pagamento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="font-medium text-foreground">
              {payment.accountPayable.invoice.number}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {payment.accountPayable.invoice.supplier.tradeName ??
                payment.accountPayable.invoice.supplier.legalName}
            </TableCell>
            <TableCell className="text-muted-foreground">{payment.method ?? '—'}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(Number(payment.amount))}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(payment.paidAt)}</TableCell>
            <TableCell>
              <PaymentStatusBadge status={payment.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
