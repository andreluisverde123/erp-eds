import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

export const contractFormSchema = z.object({
  contractorId: z.string().min(1, 'Selecione a empresa terceirizada.'),
  constructionSiteId: z.string().min(1, 'Selecione a obra.'),
  scope: z
    .string()
    .trim()
    .min(1, 'Informe o escopo do contrato.')
    .max(500, 'Máximo de 500 caracteres.'),
  totalValue: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  startDate: z.string().min(1, 'Informe a data de início.'),
  endDate: z.string().min(1, 'Informe a data de fim.'),
});

export type ContractFormValues = z.infer<typeof contractFormSchema>;

export const CONTRACT_FORM_DEFAULTS: ContractFormValues = {
  contractorId: '',
  constructionSiteId: '',
  scope: '',
  totalValue: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
};
