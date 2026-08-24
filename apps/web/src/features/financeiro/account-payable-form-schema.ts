import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/// Lançamento avulso de conta a pagar.
///
/// `supplierId` e `costCenterId` são ids do cadastro, nunca texto livre: o
/// fornecedor tem cadastro estruturado (e é ele que o Financeiro precisa
/// alcançar depois), e o centro de custo é o que diz a que a despesa pertence.
export const accountPayableFormSchema = z.object({
  supplierId: z.string().min(1, 'Selecione o fornecedor.'),
  description: z.string().trim().min(1, 'Informe a descrição.').max(200),
  costCenterId: z.string().min(1, 'Selecione o centro de custo.'),
  amount: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  issueDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  documentNumber: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

export type AccountPayableFormValues = z.infer<typeof accountPayableFormSchema>;

export const ACCOUNT_PAYABLE_FORM_DEFAULTS: AccountPayableFormValues = {
  supplierId: '',
  description: '',
  costCenterId: '',
  amount: '',
  dueDate: '',
  issueDate: new Date().toISOString().slice(0, 10),
  paymentMethod: '',
  documentNumber: '',
  notes: '',
};
