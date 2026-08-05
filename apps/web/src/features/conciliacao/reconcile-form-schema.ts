import { z } from 'zod';

export const reconcileFormSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Selecione a ordem de compra.'),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'CASH', 'BANK_SLIP'], {
    message: 'Selecione a forma de pagamento.',
  }),
  paymentTerms: z.enum(['CASH', 'NET_30', 'NET_30_60', 'NET_30_60_90'], {
    message: 'Selecione a condição de pagamento.',
  }),
  /// Data-base dos vencimentos. "30/60/90" conta a partir dela, não da emissão
  /// da nota. Vazia faz a API cair na data de emissão.
  dueDate: z.string().optional(),
  notes: z.string().trim().max(1000, 'Máximo de 1000 caracteres.').optional(),
});

export type ReconcileFormValues = z.infer<typeof reconcileFormSchema>;

export const RECONCILE_FORM_DEFAULTS: ReconcileFormValues = {
  purchaseOrderId: '',
  paymentMethod: 'BANK_SLIP',
  paymentTerms: 'NET_30',
  dueDate: '',
  notes: '',
};
