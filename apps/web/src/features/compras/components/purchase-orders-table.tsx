import { Fragment, memo, useState } from 'react';

import { ChevronDown, ChevronRight, FileText, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import {
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { downloadPurchaseOrderPdf } from '../api';
import { PurchaseOrderFinancialStatusPanel } from './purchase-order-financial-status';
import { PurchaseOrderItemsTable } from './purchase-order-items-table';
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
  // Expandir em vez de abrir uma tela nova: a listagem já é a tela da Ordem
  // de Compra, e o detalhamento por item é justamente o que faltava nela.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

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
          <TableHead className="w-10" />
          <TableHead>Número</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Solicitação</TableHead>
          <TableHead className="text-right">Valor Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Data</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const aberta = expandidas.has(order.id);

          return (
            <Fragment key={order.id}>
              <TableRow>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => alternar(order.id)}
                    aria-expanded={aberta}
                    aria-label={
                      aberta ? `Ocultar itens da ${order.code}` : `Ver itens da ${order.code}`
                    }
                  >
                    {aberta ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {order.code}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {order.items.length > 0
                      ? `${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}`
                      : 'sem itens'}
                  </span>
                </TableCell>
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
                <TableCell className="text-muted-foreground">
                  {formatDate(order.issueDate)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => void downloadPurchaseOrderPdf(order.id, order.code)}
                    aria-label={`Baixar PDF da ${order.code}`}
                    title="Baixar PDF"
                  >
                    <FileText className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>

              {aberta && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="bg-muted/30 p-0">
                    <PurchaseOrderItemsTable items={order.items} totalAmount={order.totalAmount} />
                    {/* Onde a compra está no financeiro. Leitura derivada — a
                        listagem já a traz junto, sem requisição extra. */}
                    <div className="border-t border-border px-4 py-3">
                      <PurchaseOrderFinancialStatusPanel status={order.financialStatus} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
});
