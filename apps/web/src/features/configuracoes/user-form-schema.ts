import { z } from 'zod';

export const userFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').email('Informe um e-mail válido.'),
  /// Vazio na edição (senha não muda por aqui — ver reset-password-dialog);
  /// obrigatório na criação, validado manualmente no submit do drawer.
  password: z
    .string()
    .min(8, 'A senha deve ter ao menos 8 caracteres.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(30, 'Máximo de 30 caracteres.').optional(),
  position: z.string().trim().max(100, 'Máximo de 100 caracteres.').optional(),
  roleId: z.string().min(1, 'Selecione o perfil.'),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export const USER_FORM_DEFAULTS: UserFormValues = {
  name: '',
  email: '',
  password: '',
  phone: '',
  position: '',
  roleId: '',
};
