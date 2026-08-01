import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

export const purchaseOrderFormSchema = z.object({
  supplierId: z.string().min(1, 'Selecione o fornecedor.'),
  totalAmount: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  issueDate: z.string().min(1, 'Informe a data de emissão.'),
  expectedDeliveryDate: z.string().optional(),
});

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>;

export const PURCHASE_ORDER_FORM_DEFAULTS: PurchaseOrderFormValues = {
  supplierId: '',
  totalAmount: '',
  issueDate: new Date().toISOString().slice(0, 10),
  expectedDeliveryDate: '',
};
