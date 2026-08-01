import { z } from 'zod';

export const employeeAllocationFormSchema = z.object({
  employeeId: z.string().min(1, 'Selecione o funcionário.'),
  constructionSiteId: z.string().min(1, 'Selecione a obra.'),
  costCenterId: z.string().optional(),
  startDate: z.string().min(1, 'Informe a data de início.'),
  endDate: z.string().optional(),
});

export type EmployeeAllocationFormValues = z.infer<typeof employeeAllocationFormSchema>;

export const EMPLOYEE_ALLOCATION_FORM_DEFAULTS: EmployeeAllocationFormValues = {
  employeeId: '',
  constructionSiteId: '',
  costCenterId: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
};
