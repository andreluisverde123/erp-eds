import { memo } from 'react';

import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { PurchaseOrderStatusBadge } from './purchase-order-status-badge';
import type { PurchaseOrder } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export const PurchaseOrdersTable = memo(function PurchaseOrdersTable({
  orders,
}: {
  orders: PurchaseOrder[];
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Nenhuma ordem de compra encontrada"
        description="Ordens são geradas a partir de solicitações aprovadas."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Solicitação</TableHead>
          <TableHead className="text-right">Valor Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium text-foreground">{order.code}</TableCell>
            <TableCell className="text-muted-foreground">
              {order.supplier.tradeName ?? order.supplier.legalName}
            </TableCell>
            <TableCell>
              <Link
                to={`/engenharia/solicitacoes/${order.purchaseRequest.id}`}
                className="text-muted-foreground hover:underline"
              >
                {order.purchaseRequest.code}
              </Link>
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(Number(order.totalAmount))}
            </TableCell>
            <TableCell>
              <PurchaseOrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(order.issueDate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
