import { z } from 'zod';

export const contractEmployeeFormSchema = z.object({
  contractId: z.string().min(1, 'Selecione o contrato.'),
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  role: z.string().trim().min(1, 'Informe a função.').max(100, 'Máximo de 100 caracteres.'),
  isActive: z.boolean(),
});

export type ContractEmployeeFormValues = z.infer<typeof contractEmployeeFormSchema>;

export const CONTRACT_EMPLOYEE_FORM_DEFAULTS: ContractEmployeeFormValues = {
  contractId: '',
  name: '',
  role: '',
  isActive: true,
};
