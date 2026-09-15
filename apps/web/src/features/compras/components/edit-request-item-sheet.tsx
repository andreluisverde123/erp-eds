import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Button,
  Input,
  Label,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';
import { unitOptionsFor } from '@/lib/measurement-units';

import { useUpdatePurchaseRequestItem } from '../hooks/use-purchase-request-mutations';
import type { PurchaseRequestItem } from '../types';
import { ItemDescriptionCell } from './item-description-cell';

const editItemSchema = z.object({
  catalogItemId: z.string(),
  catalogItemCode: z.string(),
  description: z.string().trim().min(1, 'Informe o item.').max(200, 'Descrição longa demais.'),
  unit: z.string().trim().min(1, 'Informe a unidade.'),
  quantity: z
    .string()
    .refine(
      (valor) => valor.trim() !== '' && Number(valor) > 0,
      'Informe uma quantidade maior que zero.',
    ),
  notes: z.string().trim().max(500, 'Observação longa demais.'),
});

type EditItemValues = z.infer<typeof editItemSchema>;

interface EditRequestItemSheetProps {
  /// O item em edição; nulo fecha a gaveta.
  item: PurchaseRequestItem | null;
  onOpenChange: (open: boolean) => void;
  purchaseRequestId: string;
  /// Solicitação aprovada: mexer em material, unidade ou quantidade a devolve
  /// para cotação, e a gaveta avisa ANTES de salvar.
  approved: boolean;
}

/// EDITAR um item de solicitação já enviada.
///
/// Um item por vez, e não a grade inteira: a edição da lista toda continua
/// sendo do rascunho. Os campos são os mesmos da grade — o mesmo autocomplete
/// de material, com o vínculo ao cadastro de insumos, e a mesma lista de
/// unidades —, só que empilhados.
export function EditRequestItemSheet({
  item,
  onOpenChange,
  purchaseRequestId,
  approved,
}: EditRequestItemSheetProps) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Editar item</SheetTitle>
          <SheetDescription>
            A alteração fica registrada no histórico da solicitação.
          </SheetDescription>
        </div>

        {/* `key` remonta o formulário por item: abrir outro item não pode
            herdar o que foi digitado no anterior. */}
        {item && (
          <EditRequestItemBody
            key={item.id}
            item={item}
            purchaseRequestId={purchaseRequestId}
            approved={approved}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditRequestItemBody({
  item,
  purchaseRequestId,
  approved,
  onDone,
}: {
  item: PurchaseRequestItem;
  purchaseRequestId: string;
  approved: boolean;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mutation = useUpdatePurchaseRequestItem(purchaseRequestId);

  const form = useForm<EditItemValues>({
    resolver: zodResolver(editItemSchema),
    defaultValues: {
      catalogItemId: item.catalogItemId ?? '',
      catalogItemCode: item.catalogItem?.code ?? '',
      description: item.description,
      unit: item.unit,
      // "10.000" do Decimal(12,3) vira "10" no campo.
      quantity: String(Number(item.quantity)),
      notes: item.notes ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const catalogItemId = useWatch({ control: form.control, name: 'catalogItemId' });
  const catalogItemCode = useWatch({ control: form.control, name: 'catalogItemCode' });

  /// Digitar por cima desfaz o vínculo com o cadastro — a mesma regra da
  /// grade: a partir daí a linha é texto livre.
  function desvincular() {
    if (!form.getValues('catalogItemId')) return;
    form.setValue('catalogItemId', '');
    form.setValue('catalogItemCode', '');
  }

  async function onSubmit(values: EditItemValues) {
    setSubmitError(null);
    try {
      await mutation.mutateAsync({
        itemId: item.id,
        input: {
          catalogItemId: values.catalogItemId || undefined,
          description: values.description,
          unit: values.unit,
          quantity: Number(values.quantity),
          notes: values.notes || undefined,
        },
      });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o item. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <form
          id="edit-request-item"
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>{submitError}</AlertTitle>
            </Alert>
          )}

          {approved && (
            <Alert>
              <AlertTitle>
                Esta solicitação já foi aprovada. Mudar o material, a unidade ou a quantidade a
                devolve para &quot;Em cotação&quot;, e ela precisa ser aprovada de novo.
              </AlertTitle>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-item-description">Item</Label>
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <ItemDescriptionCell
                  id="edit-item-description"
                  value={field.value}
                  onChange={(valor) => {
                    field.onChange(valor);
                    desvincular();
                  }}
                  onBlur={field.onBlur}
                  catalogItemId={catalogItemId || undefined}
                  catalogItemCode={catalogItemCode || undefined}
                  onPick={(escolha) => {
                    field.onChange(escolha.description);
                    if (escolha.catalogItem) {
                      form.setValue('catalogItemId', escolha.catalogItem.id);
                      form.setValue('catalogItemCode', escolha.catalogItem.code);
                      form.setValue('unit', escolha.catalogItem.unit, { shouldValidate: true });
                    } else {
                      desvincular();
                    }
                  }}
                  placeholder="Cimento CPII 50kg"
                  aria-invalid={Boolean(errors.description)}
                  className="h-9"
                />
              )}
            />
            <FieldError message={errors.description?.message} />
            <p className="text-xs text-muted-foreground">
              Trocar o material ou a unidade apaga o preço já cotado deste item.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-unit">Unidade</Label>
              <Controller
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-item-unit" aria-invalid={Boolean(errors.unit)}>
                      <SelectValue placeholder="UN">{field.value}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptionsFor(field.value).map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          <span className="font-medium">{option.code}</span>
                          <span className="text-muted-foreground">{option.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.unit?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-quantity">Quantidade</Label>
              <Controller
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <NumberInput
                    {...field}
                    id="edit-item-quantity"
                    value={field.value ?? ''}
                    mode="decimal"
                    decimalScale={3}
                    aria-invalid={Boolean(errors.quantity)}
                    className="text-right"
                  />
                )}
              />
              <FieldError message={errors.quantity?.message} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-item-notes">Observação</Label>
            <Input id="edit-item-notes" placeholder="Opcional" {...form.register('notes')} />
            <FieldError message={errors.notes?.message} />
          </div>
        </form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="edit-request-item" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar item'}
        </Button>
      </div>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
