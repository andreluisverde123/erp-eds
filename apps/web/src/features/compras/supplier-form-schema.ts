import { z } from 'zod';

export const supplierFormSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, 'Informe a razão social.')
    .max(150, 'Máximo de 150 caracteres.'),
  tradeName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
  document: z.string().trim().min(1, 'Informe o CNPJ.').max(20, 'Máximo de 20 caracteres.'),
  contactName: z.string().trim().max(150, 'Máximo de 150 caracteres.').optional(),
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

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const SUPPLIER_FORM_DEFAULTS: SupplierFormValues = {
  legalName: '',
  tradeName: '',
  document: '',
  contactName: '',
  email: '',
  phone: '',
  city: '',
  state: '',
};

export function toSupplierInput(values: SupplierFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? undefined : value]),
  ) as SupplierFormValues;
}
