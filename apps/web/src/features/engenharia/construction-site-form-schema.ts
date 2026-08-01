import { z } from 'zod';

export const constructionSiteFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código.').max(30, 'Máximo de 30 caracteres.'),
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  clientName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  city: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || value.length === 2, 'A UF deve ter 2 letras.')
    .optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']),
  responsibleName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  description: z.string().trim().max(2000, 'Máximo de 2000 caracteres.').optional(),
});

export type ConstructionSiteFormValues = z.infer<typeof constructionSiteFormSchema>;

export const CONSTRUCTION_SITE_FORM_DEFAULTS: ConstructionSiteFormValues = {
  code: '',
  name: '',
  clientName: '',
  city: '',
  state: '',
  startDate: '',
  expectedEndDate: '',
  status: 'PLANNING',
  responsibleName: '',
  description: '',
};

/// Campos opcionais em branco viram `undefined` (não string vazia) antes de ir
/// pra API — mantém o payload limpo e alinhado com o que os DTOs esperam.
export function toConstructionSiteInput(values: ConstructionSiteFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? undefined : value]),
  ) as ConstructionSiteFormValues;
}
