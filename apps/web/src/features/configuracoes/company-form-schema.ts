import { z } from 'zod';

export const companyFormSchema = z.object({
  tradeName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  legalName: z
    .string()
    .trim()
    .min(1, 'Informe a razão social.')
    .max(150, 'Máximo de 150 caracteres.'),
  stateRegistration: z.string().trim().max(30, 'Máximo de 30 caracteres.').optional(),
  phone: z.string().trim().max(30, 'Máximo de 30 caracteres.').optional(),
  email: z.string().trim().max(150).email('Informe um e-mail válido.').optional().or(z.literal('')),
  website: z.string().trim().max(200, 'Máximo de 200 caracteres.').optional(),
  zipCode: z.string().trim().max(8, 'Máximo de 8 caracteres.').optional(),
  addressLine: z.string().trim().max(200, 'Máximo de 200 caracteres.').optional(),
  addressNumber: z.string().trim().max(20, 'Máximo de 20 caracteres.').optional(),
  addressComplement: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  city: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || value.length === 2, 'A UF deve ter 2 letras.')
    .optional(),
  responsibleName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
