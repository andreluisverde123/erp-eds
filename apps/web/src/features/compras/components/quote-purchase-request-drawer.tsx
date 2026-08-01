import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  NumberInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useUpdatePurchaseRequestQuote } from '../hooks/use-purchase-request-mutations';
import type { PurchaseRequestItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface QuotePurchaseRequestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseRequestId: string;
  items: PurchaseRequestItem[];
}

/// Onde o valor unitário é informado desde que saiu do formulário de
/// solicitação: quem abre o pedido não conhece o preço, Compras cota depois.
/// A grade aqui é só de preço — descrição, unidade e quantidade são do
/// solicitante e aparecem como leitura.
export function QuotePurchaseRequestDrawer({
  open,
  onOpenChange,
  purchaseRequestId,
  items,
}: QuotePurchaseRequestDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Informar cotação</SheetTitle>
          <SheetDescription>
            Preencha o valor unitário negociado de cada item. É esse total que a alçada de aprovação
            usa.
          </SheetDescription>
        </div>

        <QuotePurchaseRequestBody
          key={open ? purchaseRequestId : 'closed'}
          purchaseRequestId={purchaseRequestId}
          items={items}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function QuotePurchaseRequestBody({
  purchaseRequestId,
  items,
  onDone,
}: {
  purchaseRequestId: string;
  items: PurchaseRequestItem[];
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.estimatedUnitPrice ?? ''])),
  );

  const quoteMutation = useUpdatePurchaseRequestQuote(purchaseRequestId);

  const filled = items.filter((item) => (prices[item.id] ?? '').trim() !== '');
  const total = filled.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(prices[item.id]),
    0,
  );

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await quoteMutation.mutateAsync({
        items: filled.map((item) => ({
          id: item.id,
          estimatedUnitPrice: Number(prices[item.id]),
        })),
      });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a cotação. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {submitError && (
          <Alert variant="destructive">
            <AlertTitle>{submitError}</AlertTitle>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="!pl-4">Item</TableHead>
                <TableHead className="w-20 text-right">Qtd.</TableHead>
                <TableHead className="w-32 !pr-4 text-right">Valor unit. (R$)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-transparent">
                  <TableCell className="!pl-4">
                    <span className="font-medium text-foreground">{item.description}</span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {Number(item.quantity)} {item.unit}
                  </TableCell>
                  <TableCell className="!pr-4 p-1">
                    <NumberInput
                      value={prices[item.id] ?? ''}
                      onChange={(value) =>
                        setPrices((current) => ({ ...current, [item.id]: value }))
                      }
                      placeholder="0,00"
                      aria-label={`Valor unitário de ${item.description}`}
                      className="h-9 text-right"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Total cotado</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={quoteMutation.isPending || filled.length === 0}
          onClick={handleSubmit}
        >
          {quoteMutation.isPending ? 'Salvando...' : 'Salvar cotação'}
        </Button>
      </div>
    </>
  );
}
