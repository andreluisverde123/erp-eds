import { memo } from 'react';

import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@repo/ui';

import { calculateLine, centsToNumber, discountFromItem } from '../quote-totals';
import type { FulfillmentStatus, PurchaseRequestItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Quantidade sem os zeros que o `Decimal(12,3)` carrega: "10", não "10,000".
function formatQuantity(value: string): string {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/// O estado do ATENDIMENTO da linha, em uma etiqueta.
///
/// Separado do "Não disponível" ao lado: aquilo é o que o fornecedor DA
/// COTAÇÃO respondeu; isto é quanto já foi efetivamente comprado, somando
/// todas as ordens. Um item pode ser "não disponível" na cotação e mesmo assim
/// estar atendido — comprado de outra loja.
const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: 'Pendente',
  PARTIAL: 'Parcial',
  FULFILLED: 'Atendido',
};

function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        status === 'FULFILLED' && 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
        status === 'PARTIAL' && 'border-amber-600/40 text-amber-700 dark:text-amber-400',
      )}
    >
      {FULFILLMENT_LABEL[status]}
    </Badge>
  );
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
          <TableHead className="text-right">Solicitado</TableHead>
          {/* O ATENDIMENTO, que é o assunto desta etapa: quanto já foi
              comprado e quanto ainda falta. Duas colunas e não uma, porque a
              pergunta operacional ("falta comprar o quê?") se responde pela
              segunda, e a de conferência ("já compramos quanto?") pela
              primeira. */}
          <TableHead className="text-right">Atendido</TableHead>
          <TableHead className="text-right">Pendente</TableHead>
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
                  <FulfillmentBadge status={item.fulfillment.status} />
                </div>
                {/* O motivo é de Compras e fica junto do estado que o
                    explica — a coluna "Observação" é do solicitante. */}
                {item.unavailable && item.unavailabilityNote && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {item.unavailabilityNote}
                  </span>
                )}
                {/* QUEM atendeu esta linha, e com quanto. É o que fecha a
                    cadeia "necessidade → compra → fornecedor → quantidade"
                    sem sair da tela: a coluna "Atendido" diz o total, e isto
                    diz de onde ele veio. */}
                {item.fulfillment.entries.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {item.fulfillment.entries.map((entrada) => (
                      <li
                        key={entrada.purchaseOrderId}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        {entrada.purchaseOrderCode} · {entrada.supplierName} ·{' '}
                        <span className="tabular-nums">
                          {formatQuantity(entrada.quantity)} {item.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{item.unit}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {quantity}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatQuantity(item.fulfillment.fulfilledQuantity)}
              </TableCell>
              {/* Destacado quando sobra saldo: é a única coluna desta tabela
                  que pede uma AÇÃO de quem está lendo. Zero fica apagado, para
                  a linha atendida não competir por atenção. */}
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  Number(item.fulfillment.pendingQuantity) > 0
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {formatQuantity(item.fulfillment.pendingQuantity)}
              </TableCell>
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
