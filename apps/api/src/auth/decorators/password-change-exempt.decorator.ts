import { SetMetadata } from '@nestjs/common';

export const PASSWORD_CHANGE_EXEMPT_KEY = 'passwordChangeExempt';

/// Marca as poucas rotas que continuam acessíveis para quem ainda está com
/// senha temporária: trocar a senha, ver o próprio perfil e sair. Todo o
/// resto é bloqueado pelo `PasswordChangeGuard`.
export const AllowWithTemporaryPassword = () => SetMetadata(PASSWORD_CHANGE_EXEMPT_KEY, true);
