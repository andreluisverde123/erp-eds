import { z } from 'zod';

export const contractorFormSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, 'Informe a razão social.')
    .max(150, 'Máximo de 150 caracteres.'),
  tradeName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  document: z.string().trim().min(1, 'Informe o CNPJ/CPF.').max(20, 'Máximo de 20 caracteres.'),
  specialty: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  responsibleName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
  email: z.string().trim().max(150).email('Informe um e-mail válido.').optional().or(z.literal('')),
  phone: z.string().trim().max(30, 'Máximo de 30 caracteres.').optional(),
  city: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || value.length === 2, 'A UF deve ter 2 letras.')
    .optional(),
});

export type ContractorFormValues = z.infer<typeof contractorFormSchema>;

export const CONTRACTOR_FORM_DEFAULTS: ContractorFormValues = {
  legalName: '',
  tradeName: '',
  document: '',
  specialty: '',
  responsibleName: '',
  status: 'ACTIVE',
  email: '',
  phone: '',
  city: '',
  state: '',
};
