import { z } from 'zod';

export const compositionFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da composição.')
    .max(150, 'Máximo de 150 caracteres.'),
  unit: z.string().min(1, 'Escolha a unidade.'),
  description: z.string().trim().max(500, 'Máximo de 500 caracteres.').optional(),
  active: z.boolean(),
});

export type CompositionFormValues = z.infer<typeof compositionFormSchema>;

export const COMPOSITION_FORM_DEFAULTS: CompositionFormValues = {
  name: '',
  unit: '',
  description: '',
  active: true,
};
