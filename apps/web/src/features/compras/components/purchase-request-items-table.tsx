import { memo } from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';

import type { PurchaseRequestItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PurchaseRequestItemsTable = memo(function PurchaseRequestItemsTable({
  items,
}: {
  items: PurchaseRequestItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Unidade</TableHead>
          <TableHead className="text-right">Quantidade</TableHead>
          {/* Preenchidos por Compras na cotação, não por quem solicitou —
              ficam em "—" enquanto a solicitação não foi cotada. */}
          <TableHead className="text-right">Valor unit. (cotação)</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
          <TableHead>Observação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const quantity = Number(item.quantity);
          const unitPrice = item.estimatedUnitPrice ? Number(item.estimatedUnitPrice) : 0;

          return (
            <TableRow key={item.id}>
              <TableCell className="font-medium text-foreground">{item.description}</TableCell>
              <TableCell className="text-muted-foreground">{item.unit}</TableCell>
              <TableCell className="text-right text-muted-foreground">{quantity}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {item.estimatedUnitPrice ? formatCurrency(unitPrice) : '—'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {item.estimatedUnitPrice ? formatCurrency(quantity * unitPrice) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{item.notes ?? '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
