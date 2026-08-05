import { useWatch, type UseFormReturn } from 'react-hook-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormControl,
  FormDescription,
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
  Textarea,
} from '@repo/ui';

import {
  getInstallmentCount,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
} from '../inbound-invoice-status';
import type { ReconcileFormValues } from '../reconcile-form-schema';

interface ReconcileFormProps {
  form: UseFormReturn<ReconcileFormValues>;
  disabled?: boolean;
}

/// Geração financeira: o que a conciliação vai criar em Contas a Pagar.
///
/// O contador de parcelas é atualizado ao vivo porque a condição escolhida
/// muda quantos vencimentos nascem — "30/60/90" gera três, e descobrir isso
/// só depois, na agenda do financeiro, é tarde.
export function ReconcileForm({ form, disabled = false }: ReconcileFormProps) {
  const terms = useWatch({ control: form.control, name: 'paymentTerms' });
  const installments = getInstallmentCount(terms);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geração financeira</CardTitle>
        <CardDescription>
          Ao confirmar, a nota é vinculada permanentemente à ordem de compra e{' '}
          {installments === 1 ? 'uma parcela é criada' : `${installments} parcelas são criadas`} em
          Contas a Pagar.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Forma de pagamento</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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

        <FormField
          control={form.control}
          name="paymentTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condição de pagamento</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_TERMS_OPTIONS.map((option) => (
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

        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data de vencimento</FormLabel>
              <FormControl>
                <Input type="date" disabled={disabled} {...field} />
              </FormControl>
              <FormDescription>
                Data-base dos vencimentos. Em branco, conta a partir da emissão da nota.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Informações que o financeiro precise ver junto da conta a pagar."
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
