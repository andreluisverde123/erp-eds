import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

export const paymentFormSchema = z.object({
  accountPayableId: z.string().min(1, 'Selecione a conta a pagar.'),
  amount: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  paidAt: z.string().min(1, 'Informe a data do pagamento.'),
  method: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'REFUNDED']),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const PAYMENT_FORM_DEFAULTS: PaymentFormValues = {
  accountPayableId: '',
  amount: '',
  paidAt: new Date().toISOString().slice(0, 10),
  method: '',
  status: 'PAID',
};
