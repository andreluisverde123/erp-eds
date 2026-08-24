import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form';
import { Checkbox, NumberInput, cn } from '@repo/ui';

import type { PurchaseOrderFormValues } from '../purchase-order-form-schema';

/// Quantidade aceita fração (1,5 m³) e não é dinheiro — mesmo motivo da grade
/// de itens da solicitação: `mode="decimal"` deixa digitar "10" e ler dez.
const QUANTITY_DECIMAL_SCALE = 3;

const cellInputClass =
  'h-9 rounded-none border-0 bg-transparent px-2 text-right shadow-none ' +
  'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ' +
  'aria-invalid:bg-destructive/10';

/// Os itens da solicitação, prontos para virar itens da ordem.
///
/// O comprador não redigita nada: descrição, unidade e quantidade já vêm da
/// solicitação, e o valor unitário vem da cotação quando existe. O que ele faz
/// aqui é DESMARCAR o que não vai comprar agora e AJUSTAR o que negociou —
/// que é exatamente onde nasce a compra parcial.
export function PurchaseOrderItemsPicker({
  control,
  errors,
}: {
  control: Control<PurchaseOrderFormValues>;
  errors: FieldErrors<PurchaseOrderFormValues>;
}) {
  const items = useWatch({ control, name: 'items' }) ?? [];

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
        Esta solicitação não tem itens.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="w-10 px-2 py-2" />
            <th className="px-2 py-2 text-left font-medium">Item</th>
            <th className="w-24 px-2 py-2 text-right font-medium">Qtd.</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Valor Unit.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const rowError = errors.items?.[index];
            const comprada = Number(item.quantity || 0);
            const solicitada = Number(item.requestedQuantity);
            const parcial = item.selected && comprada > 0 && comprada !== solicitada;

            return (
              <tr
                key={item.purchaseRequestItemId}
                className={cn(
                  'border-b border-border/50 last:border-0',
                  !item.selected && 'opacity-50',
                )}
              >
                <td className="px-2 py-2 align-top">
                  <Controller
                    control={control}
                    name={`items.${index}.selected`}
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        aria-label={`Comprar ${item.description}`}
                      />
                    )}
                  />
                </td>
                <td className="px-2 py-2">
                  <span className="text-foreground">{item.description}</span>
                  <span className="block text-xs text-muted-foreground">
                    solicitados {Number(item.requestedQuantity).toLocaleString('pt-BR')} {item.unit}
                  </span>
                  {parcial && (
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      compra parcial
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 align-top">
                  <Controller
                    control={control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <NumberInput
                        {...field}
                        value={field.value ?? ''}
                        mode="decimal"
                        decimalScale={QUANTITY_DECIMAL_SCALE}
                        disabled={!item.selected}
                        aria-label={`Quantidade de ${item.description}`}
                        aria-invalid={Boolean(rowError?.quantity)}
                        className={cellInputClass}
                      />
                    )}
                  />
                  {rowError?.quantity && (
                    <span className="block px-2 text-xs text-destructive">
                      {rowError.quantity.message}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 align-top">
                  <Controller
                    control={control}
                    name={`items.${index}.unitPrice`}
                    render={({ field }) => (
                      <NumberInput
                        {...field}
                        value={field.value ?? ''}
                        placeholder="0,00"
                        disabled={!item.selected}
                        aria-label={`Valor unitário de ${item.description}`}
                        aria-invalid={Boolean(rowError?.unitPrice)}
                        className={cellInputClass}
                      />
                    )}
                  />
                  {rowError?.unitPrice && (
                    <span className="block px-2 text-xs text-destructive">
                      {rowError.unitPrice.message}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
