import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() === '' || !Number.isNaN(Number(value));
}

export const employeeFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  cpf: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'O CPF deve conter 11 dígitos numéricos.'),
  position: z.string().trim().min(1, 'Informe o cargo.').max(100, 'Máximo de 100 caracteres.'),
  status: z.enum(['ACTIVE', 'VACATION', 'ON_LEAVE', 'TERMINATED']),
  hireDate: z.string().min(1, 'Informe a data de admissão.'),
  terminationDate: z.string().optional(),
  baseSalary: z.string().refine(isValidNumber, 'Salário inválido.').optional(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const EMPLOYEE_FORM_DEFAULTS: EmployeeFormValues = {
  name: '',
  cpf: '',
  position: '',
  status: 'ACTIVE',
  hireDate: new Date().toISOString().slice(0, 10),
  terminationDate: '',
  baseSalary: '',
};
