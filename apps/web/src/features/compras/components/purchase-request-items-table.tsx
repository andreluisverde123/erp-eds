import { memo } from 'react';

import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@repo/ui';

import { calculateLine, centsToNumber, discountFromItem } from '../quote-totals';
import type { PurchaseRequestItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: string): string {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
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
          <TableHead className="text-right">Desconto</TableHead>
          {/* Já LÍQUIDO do desconto da linha: é o que esta linha vale. O bruto
              aparece no resumo financeiro, somado. */}
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Observação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const quantity = Number(item.quantity);
          const unitPrice = item.estimatedUnitPrice ? Number(item.estimatedUnitPrice) : 0;
          const hasPrice = Boolean(item.estimatedUnitPrice) && !item.unavailable;
          // A mesma conta da gaveta de cotação e do backend — ver
          // `quote-totals.ts`.
          const linha = calculateLine(
            item.quantity,
            item.estimatedUnitPrice ?? '',
            !item.unavailable,
            discountFromItem(item),
          );

          return (
            // Esmaecida quando o fornecedor não tem o item — mesmo sinal que a
            // grade de cotação e o seletor da ordem usam para "linha fora
            // desta conta". A linha continua ali: ela não saiu da solicitação.
            <TableRow key={item.id} className={cn(item.unavailable && 'opacity-60')}>
              <TableCell className="font-medium text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{item.description}</span>
                  {item.unavailable && (
                    <Badge variant="outline" className="font-normal">
                      Não disponível
                    </Badge>
                  )}
                </div>
                {/* O motivo é de Compras e fica junto do estado que o
                    explica — a coluna "Observação" é do solicitante. */}
                {item.unavailable && item.unavailabilityNote && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {item.unavailabilityNote}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{item.unit}</TableCell>
              <TableCell className="text-right text-muted-foreground">{quantity}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {hasPrice ? formatCurrency(unitPrice) : '—'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {linha.discount > 0 ? (
                  <>
                    {`- ${formatCurrency(centsToNumber(linha.discount))}`}
                    {/* A porcentagem informada fica ao lado do valor: o que
                        foi combinado é "10%", e só ele explica o número. */}
                    {item.discountType === 'PERCENT' && (
                      <span className="ml-1 text-xs text-muted-foreground/70">
                        ({formatPercent(item.discountValue)})
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {hasPrice ? formatCurrency(centsToNumber(linha.net)) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{item.notes ?? '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
