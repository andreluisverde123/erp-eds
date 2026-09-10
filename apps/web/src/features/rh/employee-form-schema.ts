import { z } from 'zod';

import { exigeDiaria } from './employee-compensation';

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
  employmentType: z.enum(['OWN', 'OUTSOURCED']),
  compensationType: z.enum(['CLT', 'DAILY']),
  dailyRate: z.string().refine(isValidNumber, 'Valor da diária inválido.').optional(),
  hireDate: z.string().min(1, 'Informe a data de admissão.'),
  terminationDate: z.string().optional(),
  baseSalary: z.string().refine(isValidNumber, 'Salário inválido.').optional(),
})
  /// A diária é exigida pelo TIPO DE REMUNERAÇÃO, não por si mesma — por isso a
  /// regra vive num `superRefine` e não no campo. É a mesma regra que a API
  /// aplica; aqui ela existe para o erro aparecer embaixo do campo, antes do
  /// pedido sair.
  .superRefine((values, ctx) => {
    if (!exigeDiaria(values.compensationType)) return;

    const valor = Number(values.dailyRate);
    if (!values.dailyRate?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyRate'],
        message: 'Informe o valor da diária.',
      });
      return;
    }
    if (valor <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyRate'],
        message: 'A diária deve ser maior que zero.',
      });
    }
  });

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const EMPLOYEE_FORM_DEFAULTS: EmployeeFormValues = {
  name: '',
  cpf: '',
  position: '',
  status: 'ACTIVE',
  employmentType: 'OWN',
  compensationType: 'CLT',
  dailyRate: '',
  hireDate: new Date().toISOString().slice(0, 10),
  terminationDate: '',
  baseSalary: '',
};
