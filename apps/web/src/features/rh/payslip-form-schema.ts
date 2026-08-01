import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

const currentDate = new Date();

export const payslipFormSchema = z.object({
  employeeId: z.string().min(1, 'Selecione o funcionário.'),
  referenceYear: z.string().refine(isValidNumber, 'Ano inválido.'),
  referenceMonth: z.string().min(1, 'Selecione o mês.'),
  grossSalary: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
  deductions: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) >= 0, 'Não pode ser negativo.'),
  netSalary: z
    .string()
    .refine(isValidNumber, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
});

export type PayslipFormValues = z.infer<typeof payslipFormSchema>;

export const PAYSLIP_FORM_DEFAULTS: PayslipFormValues = {
  employeeId: '',
  referenceYear: String(currentDate.getUTCFullYear()),
  referenceMonth: String(currentDate.getUTCMonth() + 1),
  grossSalary: '',
  deductions: '',
  netSalary: '',
};

export const MONTH_OPTIONS = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];
