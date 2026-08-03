import { z } from 'zod';

export const roleFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(100, 'Máximo de 100 caracteres.'),
  type: z.string().min(1, 'Selecione o tipo.'),
  description: z.string().trim().max(300, 'Máximo de 300 caracteres.').optional(),
  permissionCodes: z.array(z.string()).min(1, 'Selecione ao menos uma permissão.'),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

export const ROLE_FORM_DEFAULTS: RoleFormValues = {
  name: '',
  type: 'VIEWER',
  description: '',
  permissionCodes: [],
};

/// `SUPER_ADMIN` sai daqui de propósito. O tipo continua no enum do banco, mas
/// nenhuma linha de código concede alcance além da própria empresa — e num ERP
/// de empresa única não haveria o que alcançar. Oferecê-lo na tela prometia um
/// poder inexistente: o administrador criava o papel achando que ganhava algo
/// e recebia exatamente as permissões que tivesse marcado, nem mais nem menos.
export const ROLE_TYPE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'ENGINEER', label: 'Engenharia' },
  { value: 'BUYER', label: 'Compras' },
  { value: 'FINANCE_ANALYST', label: 'Financeiro' },
  { value: 'HR_ANALYST', label: 'RH' },
  { value: 'VIEWER', label: 'Visualização' },
];
