import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
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

import { useCreatePurchaseOrder } from '../hooks/use-purchase-order-mutations';
import { usePurchaseRequest } from '../hooks/use-purchase-request';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';
import { useSuppliers } from '../hooks/use-suppliers';
import {
  itemsFromPurchaseRequest,
  PURCHASE_ORDER_FORM_DEFAULTS,
  purchaseOrderFormSchema,
  selectedItemsSubtotal,
  type PurchaseOrderFormValues,
} from '../purchase-order-form-schema';
import { PurchaseOrderItemsPicker } from './purchase-order-items-picker';

interface GeneratePurchaseOrderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseRequestId: string;
  onCreated: () => void;
}

export function GeneratePurchaseOrderDrawer({
  open,
  onOpenChange,
  purchaseRequestId,
  onCreated,
}: GeneratePurchaseOrderDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Gerar Ordem de Compra</SheetTitle>
          <SheetDescription>
            Os itens vêm da solicitação. Ajuste o que foi negociado e escolha o fornecedor.
          </SheetDescription>
        </div>

        <GeneratePurchaseOrderBody
          key={open ? purchaseRequestId : 'closed'}
          purchaseRequestId={purchaseRequestId}
          onDone={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </SheetContent>
    </Sheet>
  );
}

function GeneratePurchaseOrderBody({
  purchaseRequestId,
  onDone,
  onCreated,
}: {
  purchaseRequestId: string;
  onDone: () => void;
  onCreated: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: suppliersData } = useSuppliers({ limit: 100 });
  const { data: request, isLoading: loadingRequest } = usePurchaseRequest(purchaseRequestId);
  const createMutation = useCreatePurchaseOrder();

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: PURCHASE_ORDER_FORM_DEFAULTS,
  });

  // A carga automática dos itens: assim que a solicitação chega, as linhas
  // dela viram as linhas do formulário, já preenchidas. É o que dispensa a
  // redigitação — o comprador desmarca e ajusta, não redigita.
  const { reset } = form;
  useEffect(() => {
    if (!request) return;
    reset((atual) => ({
      ...atual,
      // Herda o centro de custo da solicitação quando ela tiver um. Quando não
      // tiver, o campo fica vazio e obrigatório — é aqui que Compras informa a
      // atribuição que o solicitante não soube dar.
      costCenterId: request.costCenter?.id ?? '',
      items: itemsFromPurchaseRequest(request.items),
    }));
  }, [request, reset]);

  // Restrita à obra da solicitação: a ordem herda a obra dela, e a API recusa
  // um centro de custo que pertença a outra.
  const { data: costCentersData } = useCostCenters({
    limit: 100,
    constructionSiteId: request?.constructionSite.id,
    enabled: Boolean(request),
  });

  // `useWatch` e não `form.watch()`: o React Compiler não consegue memoizar a
  // função devolvida pelo `watch` e pula a otimização do componente inteiro
  // (o lint recusa o aviso). Mesmo padrão da grade de itens da solicitação.
  const items = useWatch({ control: form.control, name: 'items' });
  const subtotal = selectedItemsSubtotal(items ?? []);

  async function onSubmit(values: PurchaseOrderFormValues) {
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        purchaseRequestId,
        supplierId: values.supplierId,
        costCenterId: values.costCenterId,
        issueDate: values.issueDate,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
        // Só as linhas marcadas, e só o que o backend aceita: descrição e
        // unidade ele copia da origem, o total ele calcula.
        items: values.items
          .filter((item) => item.selected)
          .map((item) => ({
            purchaseRequestItemId: item.purchaseRequestItemId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
      });
      onCreated();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível gerar a ordem de compra. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="purchase-order-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o fornecedor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {suppliersData?.data.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.tradeName ?? supplier.legalName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="costCenterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Centro de Custo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o centro de custo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {costCentersData?.data.map((costCenter) => (
                        <SelectItem key={costCenter.id} value={costCenter.id}>
                          <span>{costCenter.name}</span>
                          <span className="text-muted-foreground">{costCenter.code}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!request?.costCenter && (
                    <p className="text-xs text-muted-foreground">
                      A solicitação não definiu um centro de custo.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <FormLabel>Itens da solicitação</FormLabel>
              {loadingRequest ? (
                <p className="text-sm text-muted-foreground">Carregando itens...</p>
              ) : (
                <PurchaseOrderItemsPicker control={form.control} errors={form.formState.errors} />
              )}
              {form.formState.errors.items?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
              )}
              <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  Total da ordem de compra
                </span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Calculado automaticamente a partir dos itens acima.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de emissão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expectedDeliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Previsão de entrega</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="purchase-order-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Gerando...' : 'Gerar Ordem de Compra'}
        </Button>
      </div>
    </>
  );
}
