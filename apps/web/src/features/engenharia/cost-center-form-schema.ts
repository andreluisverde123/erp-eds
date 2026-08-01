import { z } from 'zod';

export const costCenterFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código.').max(30, 'Máximo de 30 caracteres.'),
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  description: z.string().trim().max(2000, 'Máximo de 2000 caracteres.').optional(),
});

export type CostCenterFormValues = z.infer<typeof costCenterFormSchema>;

export const COST_CENTER_FORM_DEFAULTS: CostCenterFormValues = {
  code: '',
  name: '',
  description: '',
};

export function toCostCenterInput(values: CostCenterFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? undefined : value]),
  ) as CostCenterFormValues;
}
