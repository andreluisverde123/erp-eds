import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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

import { useCreatePurchaseOrder } from '../hooks/use-purchase-order-mutations';
import { useSuppliers } from '../hooks/use-suppliers';
import {
  PURCHASE_ORDER_FORM_DEFAULTS,
  purchaseOrderFormSchema,
  type PurchaseOrderFormValues,
} from '../purchase-order-form-schema';

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
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Gerar Ordem de Compra</SheetTitle>
          <SheetDescription>Escolha o fornecedor e informe o valor negociado.</SheetDescription>
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
  const createMutation = useCreatePurchaseOrder();

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: PURCHASE_ORDER_FORM_DEFAULTS,
  });

  async function onSubmit(values: PurchaseOrderFormValues) {
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        purchaseRequestId,
        supplierId: values.supplierId,
        totalAmount: Number(values.totalAmount),
        issueDate: values.issueDate,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
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
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Total (R$)</FormLabel>
                  <FormControl>
                    <NumberInput placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
