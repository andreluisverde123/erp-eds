import type { PixKeyType } from '../../../generated/prisma/client';
import { hasValidCheckDigits, onlyDigits } from '../../common/utils/document.util';

/// Regras puras dos dados bancários: normalização, formato e máscara.
///
/// Sem Prisma, sem I/O e sem Nest — é aqui que mora o que precisa ser
/// conferido caso a caso, e um teste desta camada não depende de banco.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RANDOM_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/// Limite do Banco Central para chave de e-mail.
const EMAIL_MAX_LENGTH = 77;

/// A forma canônica de cada tipo de chave — é ela que vai cifrada para o
/// banco. Guardar "(11) 99999-8888" e "+5511999998888" como chaves diferentes
/// faria a mesma pessoa aparecer duas vezes no dia em que alguém procurar por
/// chave.
export function normalizePixKey(type: PixKeyType, rawKey: string): string {
  const key = rawKey.trim();
  switch (type) {
    case 'CPF':
    case 'CNPJ':
    case 'PHONE':
      return onlyDigits(key);
    case 'EMAIL':
      return key.toLowerCase();
    case 'RANDOM':
      return key.toLowerCase();
  }
}

/// Formato por tipo de chave, aplicado sobre o valor JÁ normalizado.
///
/// CPF e CNPJ conferem o DÍGITO VERIFICADOR, não só o comprimento — ao
/// contrário do documento de fornecedor, que chega assinado da SEFAZ (ver
/// `hasValidCheckDigits`). Aqui alguém digitou, e um celular sem DDI tem os
/// mesmos 11 dígitos de um CPF: sem o módulo 11 não haveria como separar os
/// dois, e a chave errada manda dinheiro para outra pessoa.
export function isValidPixKey(type: PixKeyType, normalizedKey: string): boolean {
  switch (type) {
    case 'CPF':
      return normalizedKey.length === 11 && hasValidCheckDigits(normalizedKey);
    case 'CNPJ':
      return normalizedKey.length === 14 && hasValidCheckDigits(normalizedKey);
    case 'PHONE':
      // 10 (fixo com DDD) a 13 (celular com DDI 55) dígitos.
      return normalizedKey.length >= 10 && normalizedKey.length <= 13;
    case 'EMAIL':
      return normalizedKey.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(normalizedKey);
    case 'RANDOM':
      return RANDOM_KEY_PATTERN.test(normalizedKey);
  }
}

export function getPixKeyFormatMessage(type: PixKeyType): string {
  switch (type) {
    case 'CPF':
      return 'CPF inválido para a chave PIX. Confira os 11 dígitos.';
    case 'CNPJ':
      return 'CNPJ inválido para a chave PIX. Confira os 14 dígitos.';
    case 'PHONE':
      return 'A chave PIX do tipo telefone precisa ter DDD e número (10 a 13 dígitos).';
    case 'EMAIL':
      return 'A chave PIX do tipo e-mail precisa ser um e-mail válido.';
    case 'RANDOM':
      return 'A chave aleatória tem o formato de UUID gerado pelo banco.';
  }
}

/// `****1234`. O que sobra é o suficiente para o usuário reconhecer a conta e
/// insuficiente para pagar alguém com ela.
///
/// Conta com 4 dígitos ou menos vira `****` inteira: mostrar "os últimos 4" de
/// um número de 4 dígitos seria mostrar o número.
export function maskAccountNumber(accountNumber: string): string {
  const digits = onlyDigits(accountNumber);
  return digits.length > 4 ? `****${digits.slice(-4)}` : '****';
}

/// `a***@email.com` para e-mail — o domínio ajuda a reconhecer e não identifica
/// ninguém sozinho. Para os demais tipos, os últimos 4 caracteres.
export function maskPixKey(type: PixKeyType, normalizedKey: string): string {
  if (type === 'EMAIL') {
    const at = normalizedKey.indexOf('@');
    if (at <= 0) return '***';
    return `${normalizedKey[0]}***${normalizedKey.slice(at)}`;
  }
  return normalizedKey.length > 4 ? `****${normalizedKey.slice(-4)}` : '****';
}
