import { z } from 'zod';

import type { SystemUser, SystemUserInput } from './types';

/// Senha não faz parte do formulário: a API gera a senha inicial no cadastro
/// e a troca acontece pelo fluxo de reset.
export const userFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').email('Informe um e-mail válido.'),
  roleId: z.string().min(1, 'Selecione o perfil.'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export const USER_FORM_DEFAULTS: UserFormValues = {
  name: '',
  email: '',
  roleId: '',
  status: 'ACTIVE',
};

export function userToFormValues(user: SystemUser): UserFormValues {
  return {
    name: user.name,
    email: user.email,
    roleId: user.roles[0]?.id ?? '',
    status: user.isActive ? 'ACTIVE' : 'INACTIVE',
  };
}

export function formValuesToInput(values: UserFormValues): SystemUserInput {
  return {
    name: values.name,
    email: values.email,
    roleId: values.roleId,
    isActive: values.status === 'ACTIVE',
  };
}
