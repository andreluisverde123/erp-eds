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

import { useCreatePayment } from '../hooks/use-payment-mutations';
import { useAccountPayables } from '../hooks/use-account-payables';
import {
  PAYMENT_FORM_DEFAULTS,
  paymentFormSchema,
  type PaymentFormValues,
} from '../payment-form-schema';
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from '../payment-status';
import { accountPayableLabel } from '../types';
import type { AccountPayable } from '../types';

interface PaymentFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Pré-seleciona a conta quando o drawer é aberto a partir de uma linha
  /// específica na tela de Contas a Pagar. Sem isso, o usuário escolhe a
  /// conta na tela de Pagamentos.
  accountPayable?: AccountPayable;
}

export function PaymentFormDrawer({ open, onOpenChange, accountPayable }: PaymentFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Registrar pagamento</SheetTitle>
          <SheetDescription>Vincule o pagamento a uma conta a pagar em aberto.</SheetDescription>
        </div>

        <PaymentFormBody
          key={open ? (accountPayable?.id ?? 'open') : 'closed'}
          accountPayable={accountPayable}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function PaymentFormBody({
  accountPayable,
  onDone,
}: {
  accountPayable?: AccountPayable;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: accountsData } = useAccountPayables({ limit: 100 });
  const createMutation = useCreatePayment();

  const payableOptions = (accountsData?.data ?? []).filter(
    (account) => account.status === 'OPEN' || account.status === 'PARTIAL',
  );

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { ...PAYMENT_FORM_DEFAULTS, accountPayableId: accountPayable?.id ?? '' },
  });

  async function onSubmit(values: PaymentFormValues) {
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        accountPayableId: values.accountPayableId,
        amount: Number(values.amount),
        paidAt: values.paidAt,
        method: values.method || undefined,
        status: values.status,
      });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar o pagamento. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="payment-form"
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
              name="accountPayableId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta a Pagar</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={Boolean(accountPayable)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(accountPayable ? [accountPayable] : payableOptions).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {accountPayableLabel(account)} —{' '}
                          {account.supplier.tradeName ?? account.supplier.legalName}
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
                name="paidAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
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
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de pagamento</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_STATUS_OPTIONS.map((option) => (
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
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="payment-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Registrar Pagamento'}
        </Button>
      </div>
    </>
  );
}
