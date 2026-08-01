import { randomInt } from 'node:crypto';

import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;
const TEMP_PASSWORD_LENGTH = 12;
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/// Senha temporária gerada pelo backend no reset administrativo (ver
/// UsersManagementService.resetPassword). Não há envio de e-mail nesta etapa
/// — o valor em texto puro é devolvido uma única vez na resposta da API para
/// o admin repassar ao usuário por fora do sistema.
export function generateTemporaryPassword(): string {
  let password = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}
