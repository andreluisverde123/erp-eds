import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@repo/ui';

import { formatAmount, formatQuantity } from '../format';
import type { ComparableItem, ItemComparison, ItemComparisonStatus } from '../types';

const STATUS_LABEL: Record<ItemComparisonStatus, string> = {
  MATCH: 'Compatível',
  DIVERGENT: 'Divergência',
  ONLY_IN_INVOICE: 'Só na nota',
  ONLY_IN_ORDER: 'Só na ordem',
};

function StatusIcon({ status }: { status: ItemComparisonStatus }) {
  if (status === 'MATCH') return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (status === 'DIVERGENT') return <AlertTriangle className="size-4 shrink-0 text-destructive" />;
  return <MinusCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />;
}

/// Uma célula com os dois lados: em cima o que a nota diz, embaixo o que a
/// ordem pediu. O valor divergente fica destacado.
function SideBySide({
  invoice,
  order,
  render,
  diverges,
}: {
  invoice: ComparableItem | null;
  order: ComparableItem | null;
  render: (item: ComparableItem) => string;
  diverges: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs tabular-nums">
      <span className={cn(diverges ? 'font-medium text-destructive' : 'text-foreground')}>
        {invoice ? render(invoice) : '—'}
      </span>
      <span className="text-muted-foreground">{order ? render(order) : '—'}</span>
    </div>
  );
}

/// Comparação linha a linha entre a nota e a ordem.
///
/// O casamento das linhas é feito no servidor por semelhança de descrição
/// (determinística, sem IA). Aqui só se mostra o resultado — inclusive o que
/// NÃO casou, que é a informação que mais importa: material cobrado sem
/// pedido, e pedido que não veio.
export function ItemComparisonTable({ items }: { items: ItemComparison[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">Itens</span>
        <span className="text-[10px] text-muted-foreground">
          linha de cima: nota · linha de baixo: ordem
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Qtd.</TableHead>
            <TableHead className="text-right">Unit.</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((comparison, index) => {
            const principal = comparison.order ?? comparison.invoice!;
            const diverge = (campo: ItemComparison['differences'][number]) =>
              comparison.differences.includes(campo);

            return (
              <TableRow key={`${principal.description}-${index}`}>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <StatusIcon status={comparison.status} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground">{principal.description}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {STATUS_LABEL[comparison.status]}
                        {comparison.invoice &&
                          comparison.order &&
                          comparison.invoice.description !== comparison.order.description && (
                            <> · nota: “{comparison.invoice.description}”</>
                          )}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <SideBySide
                    invoice={comparison.invoice}
                    order={comparison.order}
                    diverges={diverge('quantity') || diverge('unit')}
                    render={(item) => `${formatQuantity(item.quantity)} ${item.unit ?? ''}`.trim()}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <SideBySide
                    invoice={comparison.invoice}
                    order={comparison.order}
                    diverges={diverge('unitPrice')}
                    render={(item) => formatAmount(item.unitPrice)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <SideBySide
                    invoice={comparison.invoice}
                    order={comparison.order}
                    diverges={diverge('totalPrice')}
                    render={(item) => formatAmount(item.totalPrice)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
