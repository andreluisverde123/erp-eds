import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form';
import {
  Checkbox,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@repo/ui';

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
    // A lista só traz o que AINDA FALTA COMPRAR, então vazia quer dizer uma de
    // duas coisas — e confundi-las faria o comprador procurar um defeito onde
    // não há. A distinção sai do formulário: nenhuma linha significa
    // solicitação sem itens; nenhuma PENDENTE significa tudo já comprado.
    return (
      <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
        Todos os itens desta solicitação já foram comprados. Não há saldo pendente para uma nova
        ordem.
      </p>
    );
  }

  return (
    // `overflow-x-auto`, não `overflow-hidden`: as colunas fixas já somam 248px
    // e este bloco vive dentro de um Sheet que é de largura total no celular —
    // com `hidden` a coluna de valor unitário era cortada e ficava inalcançável,
    // em vez de rolar. Mesmo tratamento do primitivo Table e da grade de itens
    // da solicitação.
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="w-10 px-2 py-2" />
            <th className="min-w-[180px] px-2 py-2 text-left font-medium">Item</th>
            <th className="w-24 px-2 py-2 text-right font-medium">Qtd.</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Valor Unit.</th>
            {/* Desconto por LINHA, copiado da cotação. Precisa estar visível:
                aplicado em silêncio, o comprador veria o total da ordem menor
                que a soma dos itens e não teria como conferir de onde veio. */}
            <th className="w-32 px-2 py-2 text-right font-medium">Desconto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const rowError = errors.items?.[index];
            const comprada = Number(item.quantity || 0);
            const solicitada = Number(item.requestedQuantity);
            const pendente = Number(item.pendingQuantity);
            const jaComprada = Number(item.fulfilledQuantity);
            // "Parcial" agora se mede contra o SALDO, não contra o solicitado:
            // numa segunda ordem, comprar os 40 que faltam de 100 é compra
            // COMPLETA do que restava, e chamá-la de parcial seria mentira.
            const parcial = item.selected && comprada > 0 && comprada < pendente;

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
                  {/* Com compra anterior, o número que importa é o SALDO — e
                      ele precisa vir acompanhado da conta que o produziu,
                      senão "pendentes 40" numa solicitação de 100 parece
                      erro. Sem compra anterior, a linha antiga continua
                      valendo e nada muda para quem emite a primeira ordem. */}
                  {jaComprada > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      pendentes {pendente.toLocaleString('pt-BR')} {item.unit} · já comprados{' '}
                      {jaComprada.toLocaleString('pt-BR')} de{' '}
                      {solicitada.toLocaleString('pt-BR')}
                    </span>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      solicitados {solicitada.toLocaleString('pt-BR')} {item.unit}
                    </span>
                  )}
                  {parcial && (
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      compra parcial — sobram {(pendente - comprada).toLocaleString('pt-BR')}{' '}
                      {item.unit}
                    </span>
                  )}
                  {/* Explica por que a linha veio desmarcada e sem preço, em
                      vez de deixar o comprador achar que esqueceram dela. */}
                  {item.unavailableInQuote && (
                    <span className="block text-xs text-muted-foreground">
                      não disponível na cotação — marque se este fornecedor tiver
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
                        // O leitor de tela anuncia o teto junto do campo; a
                        // validação do formulário recusa acima dele, e o
                        // servidor recusa de novo dentro da transação.
                        aria-valuemax={pendente}
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
                <td className="px-2 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <Controller
                      control={control}
                      name={`items.${index}.discountType`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!item.selected}
                        >
                          <SelectTrigger
                            className="h-9 w-[58px] shrink-0"
                            aria-label={`Tipo do desconto de ${item.description}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AMOUNT">R$</SelectItem>
                            <SelectItem value="PERCENT">%</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`items.${index}.discountValue`}
                      render={({ field }) => (
                        <NumberInput
                          {...field}
                          value={field.value ?? ''}
                          placeholder="0,00"
                          disabled={!item.selected}
                          aria-label={`Desconto de ${item.description}`}
                          className={cellInputClass}
                        />
                      )}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
