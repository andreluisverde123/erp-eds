import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

export const invoiceFormSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Selecione a ordem de compra.'),
  number: z.string().trim().min(1, 'Informe o número da nota.').max(30, 'Máximo de 30 caracteres.'),
  series: z.string().trim().max(20, 'Máximo de 20 caracteres.').optional(),
  issueDate: z.string().min(1, 'Informe a data de emissão.'),
  totalAmount: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export const INVOICE_FORM_DEFAULTS: InvoiceFormValues = {
  purchaseOrderId: '',
  number: '',
  series: '',
  issueDate: new Date().toISOString().slice(0, 10),
  totalAmount: '',
};
