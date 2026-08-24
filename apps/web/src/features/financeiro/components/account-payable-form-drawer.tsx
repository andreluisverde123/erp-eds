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
  Textarea,
} from '@repo/ui';

import { useSuppliers } from '@/features/compras/hooks/use-suppliers';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';
import { ApiError } from '@/lib/api-client';

import {
  ACCOUNT_PAYABLE_FORM_DEFAULTS,
  accountPayableFormSchema,
  type AccountPayableFormValues,
} from '../account-payable-form-schema';
import { useCreateAccountPayable } from '../hooks/use-account-payable-mutations';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from '../types';

interface AccountPayableFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/// Lançamento de conta a pagar sem passar por solicitação, ordem ou nota.
///
/// Reaproveita os seletores que já existem — `useSuppliers` (Compras) e
/// `useCostCenters` (Engenharia) — em vez de duplicar cadastro: o fornecedor
/// é sempre escolhido do cadastro estruturado, nunca digitado.
export function AccountPayableFormDrawer({ open, onOpenChange }: AccountPayableFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Nova Conta a Pagar</SheetTitle>
          <SheetDescription>
            Lançamento direto, sem ordem de compra nem nota fiscal. Depois de salvo, segue pelo
            fluxo normal de pagamento.
          </SheetDescription>
        </div>

        <AccountPayableFormBody
          key={open ? 'aberto' : 'fechado'}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function AccountPayableFormBody({ onDone }: { onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: suppliersData } = useSuppliers({ limit: 100 });
  const { data: costCentersData } = useCostCenters({ limit: 100 });
  const createMutation = useCreateAccountPayable();

  const form = useForm<AccountPayableFormValues>({
    resolver: zodResolver(accountPayableFormSchema),
    defaultValues: ACCOUNT_PAYABLE_FORM_DEFAULTS,
  });

  async function onSubmit(values: AccountPayableFormValues) {
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        supplierId: values.supplierId,
        description: values.description,
        costCenterId: values.costCenterId,
        amount: Number(values.amount),
        dueDate: values.dueDate,
        issueDate: values.issueDate || undefined,
        paymentMethod: (values.paymentMethod as PaymentMethod) || undefined,
        documentNumber: values.documentNumber || undefined,
        notes: values.notes || undefined,
      });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível lançar a conta. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="account-payable-form"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Aluguel do canteiro — agosto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="costCenterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Centro de custo / Obra</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o centro de custo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {costCentersData?.data.map((costCenter) => (
                        <SelectItem key={costCenter.id} value={costCenter.id}>
                          {costCenter.code} — {costCenter.name}
                          {costCenter.constructionSite
                            ? ` (${costCenter.constructionSite.name})`
                            : ' (administrativo)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emissão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de pagamento</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="documentNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do documento</FormLabel>
                  <FormControl>
                    <Input placeholder="Recibo, contrato, fatura..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="account-payable-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Lançando...' : 'Lançar conta'}
        </Button>
      </div>
    </>
  );
}
