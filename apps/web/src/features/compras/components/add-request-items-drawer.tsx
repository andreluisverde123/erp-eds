import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useAddPurchaseRequestItems } from '../hooks/use-purchase-request-mutations';
import {
  isBlankItemRow,
  purchaseRequestFormSchema,
  PURCHASE_REQUEST_FORM_DEFAULTS,
  type PurchaseRequestFormValues,
} from '../purchase-request-form-schema';
import { PurchaseRequestItemsGrid } from './purchase-request-items-grid';

interface AddRequestItemsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseRequestId: string;
  requestCode: string;
}

/// INCLUIR itens numa solicitação já enviada.
///
/// **Por que uma gaveta separada da edição.** A edição substitui a lista
/// inteira e continua congelada depois do envio — apagar e recriar as linhas
/// descartaria a cotação já feita. Aqui só se acrescenta, e é o que torna a
/// operação segura fora do rascunho.
///
/// A grade é a MESMA do formulário de solicitação: mesma digitação em estilo
/// planilha, mesmo autocomplete de material, mesma linha que nasce sozinha ao
/// sair da última preenchida. Quem já sabe abrir uma solicitação não aprende
/// nada novo aqui.
export function AddRequestItemsDrawer({
  open,
  onOpenChange,
  purchaseRequestId,
  requestCode,
}: AddRequestItemsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Incluir itens</SheetTitle>
          <SheetDescription>
            Os itens entram na {requestCode}, junto dos que já estão lá. O que já foi enviado não é
            alterado.
          </SheetDescription>
        </div>

        {/* `key` remonta o formulário a cada abertura: sem isso, o que foi
            digitado numa inclusão anterior reapareceria na seguinte. */}
        <AddRequestItemsBody
          key={open ? purchaseRequestId : 'closed'}
          purchaseRequestId={purchaseRequestId}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function AddRequestItemsBody({
  purchaseRequestId,
  onDone,
}: {
  purchaseRequestId: string;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mutation = useAddPurchaseRequestItems(purchaseRequestId);

  // O formulário inteiro da solicitação, mas só a grade é usada e só os itens
  // são enviados. É o que permite reaproveitar `PurchaseRequestItemsGrid` sem
  // uma segunda versão dela que fosse divergindo com o tempo.
  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues: PURCHASE_REQUEST_FORM_DEFAULTS,
  });

  async function onSubmit(values: PurchaseRequestFormValues) {
    setSubmitError(null);

    // A grade sempre mantém uma linha vazia no fim, à espera do próximo item.
    // Ela não é um pedido.
    const itens = values.items.filter((item) => !isBlankItemRow(item));

    if (itens.length === 0) {
      setSubmitError('Informe ao menos um item para incluir.');
      return;
    }

    try {
      await mutation.mutateAsync(
        itens.map((item) => ({
          description: item.description.trim(),
          unit: item.unit,
          quantity: Number(item.quantity),
          notes: item.notes?.trim() || undefined,
        })),
      );
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível incluir os itens. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form id="add-request-items" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <PurchaseRequestItemsGrid
              control={form.control}
              register={form.register}
              errors={form.formState.errors}
            />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="add-request-items" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Incluindo...' : 'Incluir itens'}
        </Button>
      </div>
    </>
  );
}
