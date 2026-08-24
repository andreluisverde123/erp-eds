import { CornerDownRight } from 'lucide-react';
import { Link } from 'react-router';

import type { PurchaseOrderItem } from '../types';

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Decimal do Prisma chega como string ("50.000"). Number() tira os zeros à
/// direita sem transformar 0,5 em 0 nem inventar casas.
function formatQuantity(value: string): string {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/// As linhas de uma ordem de compra, com a origem de cada uma.
///
/// A coluna "Origem" é o ponto: ela mostra a LINHA da solicitação, não a
/// solicitação — que já aparece no cabeçalho da ordem. Quando a quantidade
/// comprada difere da solicitada, a diferença fica escrita ali, porque é
/// exatamente o caso que alguém vai precisar explicar depois.
export function PurchaseOrderItemsTable({
  items,
  totalAmount,
}: {
  items: PurchaseOrderItem[];
  totalAmount: string;
}) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        Esta ordem foi emitida antes do detalhamento por item e não tem linhas registradas. O valor
        total dela continua válido.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="px-4 py-2 text-left font-medium">Descrição</th>
          <th className="px-4 py-2 text-right font-medium">Qtd.</th>
          <th className="px-4 py-2 text-left font-medium">Un.</th>
          <th className="px-4 py-2 text-right font-medium">Valor Unit.</th>
          <th className="px-4 py-2 text-right font-medium">Valor Total</th>
          <th className="px-4 py-2 text-left font-medium">Origem</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const comprada = Number(item.quantity);
          const solicitada = Number(item.purchaseRequestItem.quantity);
          const parcial = comprada !== solicitada;

          return (
            <tr key={item.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2 text-foreground">
                {item.description}
                {item.notes && (
                  <span className="block text-xs text-muted-foreground">{item.notes}</span>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground">
                {formatQuantity(item.quantity)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{item.unit}</td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {formatCurrency(item.unitPrice)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground">
                {formatCurrency(item.totalPrice)}
              </td>
              <td className="px-4 py-2">
                <Link
                  to={`/engenharia/solicitacoes/${item.purchaseRequestItem.purchaseRequest.id}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <CornerDownRight className="size-3 shrink-0" aria-hidden />
                  {item.purchaseRequestItem.purchaseRequest.code}
                </Link>
                {parcial && (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    solicitados {formatQuantity(item.purchaseRequestItem.quantity)}{' '}
                    {item.purchaseRequestItem.unit}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border">
          <td colSpan={3} className="px-4 py-3 font-medium text-foreground">
            Total da ordem de compra
            <span className="block text-xs font-normal text-muted-foreground">
              Calculado automaticamente a partir dos itens.
            </span>
          </td>
          <td colSpan={3} className="px-4 py-3 text-right">
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCurrency(totalAmount)}
            </span>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
