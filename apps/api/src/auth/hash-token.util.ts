import { createHash } from 'node:crypto';

/// Hash determinístico (sha256) para tokens de alta entropia já assinados
/// (JWT). Diferente de senha: aqui não há espaço de busca pequeno para
/// atacar por força bruta, então um hash rápido é apropriado — bcrypt (lento
/// de propósito) seria a escolha errada e só penalizaria performance.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
