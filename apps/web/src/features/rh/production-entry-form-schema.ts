import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

export const productionEntryFormSchema = z.object({
  employeeId: z.string().min(1, 'Selecione o funcionário.'),
  constructionSiteId: z.string().min(1, 'Selecione a obra.'),
  costCenterId: z.string().optional(),
  date: z.string().min(1, 'Informe a data.'),
  description: z
    .string()
    .trim()
    .min(1, 'Informe o serviço executado.')
    .max(200, 'Máximo de 200 caracteres.'),
  quantity: z
    .string()
    .refine(isValidNumber, 'Quantidade inválida.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  unit: z.string().trim().min(1, 'Informe a unidade.').max(20, 'Máximo de 20 caracteres.'),
});

export type ProductionEntryFormValues = z.infer<typeof productionEntryFormSchema>;

export const PRODUCTION_ENTRY_FORM_DEFAULTS: ProductionEntryFormValues = {
  employeeId: '',
  constructionSiteId: '',
  costCenterId: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  quantity: '',
  unit: '',
};
