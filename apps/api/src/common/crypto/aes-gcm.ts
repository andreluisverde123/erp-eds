import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/// Primitivas de cifragem simétrica do projeto.
///
/// Extraídas de `FiscalCryptoService`, que era o único lugar que cifrava algo.
/// O FORMATO NA FIA É EXATAMENTE O MESMO (`iv:authTag:ciphertext` em hex, e
/// `iv|authTag|ciphertext` para binário) — certificados já gravados continuam
/// legíveis. A extração existe para que o próximo dado sensível reutilize o
/// mecanismo em vez de inventar o dele.
///
/// AES-256-GCM, não CBC: o GCM é autenticado, então adulterar o texto cifrado
/// no banco produz erro na decifragem em vez de devolver lixo silenciosamente.

export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH = 12; // 96 bits, o tamanho recomendado para GCM
export const AUTH_TAG_LENGTH = 16;
export const KEY_LENGTH = 32; // 256 bits

export function encryptStringWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(
    ':',
  );
}

/// Lança quando o formato não bate ou a autenticação falha. Quem chama traduz
/// para uma mensagem de usuário — NUNCA propague o erro do OpenSSL, que varia
/// conforme o motivo e vira oráculo para quem testa entradas.
export function decryptStringWithKey(key: Buffer, payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Dado cifrado em formato inválido.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}

export function encryptBufferWithKey(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBufferWithKey(key: Buffer, payload: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/// Aceita a chave em hex (64 caracteres) ou base64. Recusar uma chave curta no
/// BOOT é melhor que descobrir no primeiro uso — e muito melhor que aceitá-la
/// e cifrar tudo com entropia insuficiente.
export function parseEncryptionKey(raw: string, variableName: string): Buffer {
  const candidate = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (candidate.length !== KEY_LENGTH) {
    throw new Error(
      `${variableName} precisa ter 32 bytes (64 hex ou 44 base64). ` +
        `Recebi ${candidate.length} bytes. Gere com: openssl rand -hex 32`,
    );
  }

  // Rejeita a chave toda-zeros, que é o que sai de um `.env` preenchido com
  // placeholder e passaria despercebida.
  if (timingSafeEqual(candidate, Buffer.alloc(KEY_LENGTH))) {
    throw new Error(`${variableName} não pode ser uma chave nula.`);
  }

  return candidate;
}
