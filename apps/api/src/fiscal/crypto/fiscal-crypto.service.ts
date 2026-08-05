import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/// AES-256-GCM, não CBC: o GCM é autenticado, então adulterar o texto cifrado
/// no banco produz erro na decifragem em vez de devolver lixo silenciosamente.
/// Para material que assina documento fiscal, falhar alto é o comportamento
/// certo.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, o tamanho recomendado para GCM
const KEY_LENGTH = 32; // 256 bits

/// Cofre do material sensível da integração fiscal.
///
/// O que passa por aqui é o `.pfx` e a senha dele — juntos, a identidade
/// jurídica da empresa. Quem os tiver consegue assinar e emitir documento
/// fiscal em nome da EDS, então o requisito não é "ofuscar": é cifrar com
/// chave que não vive no banco.
///
/// A chave vem de `FISCAL_CERT_ENCRYPTION_KEY` (env, validada no boot). Ela
/// NÃO fica no mesmo lugar que o dado cifrado — é o que faz um vazamento de
/// dump de banco não ser suficiente para reconstruir o certificado.
@Injectable()
export class FiscalCryptoService {
  private readonly logger = new Logger(FiscalCryptoService.name);
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const raw = configService.getOrThrow<string>('FISCAL_CERT_ENCRYPTION_KEY');
    this.key = this.parseKey(raw);
  }

  /// Cifra e devolve `iv:authTag:ciphertext` em hex. Os três num campo só
  /// porque separá-los em colunas convidaria alguém a gravar um sem o outro.
  encryptString(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
  }

  decryptString(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      throw new InternalServerErrorException('Dado cifrado em formato inválido.');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Nunca propagar a mensagem do OpenSSL: ela varia conforme o motivo da
      // falha e dá pistas de oráculo a quem estiver testando entradas.
      this.logger.error('Falha ao decifrar dado sensível — chave trocada ou registro adulterado.');
      throw new InternalServerErrorException(
        'Não foi possível ler o dado protegido. A chave de criptografia pode ter mudado.',
      );
    }
  }

  /// Mesma coisa para binário (o .pfx). O IV e a tag vão como PREFIXO do
  /// buffer, o que mantém o registro num campo `Bytes` só.
  encryptBuffer(plaintext: Buffer): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decryptBuffer(payload: Buffer): Buffer {
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = payload.subarray(IV_LENGTH + 16);

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      this.logger.error('Falha ao decifrar o certificado — chave trocada ou registro adulterado.');
      throw new InternalServerErrorException(
        'Não foi possível ler o certificado protegido. A chave de criptografia pode ter mudado.',
      );
    }
  }

  /// Aceita a chave em hex (64 caracteres) ou base64. Recusar uma chave curta
  /// no BOOT é melhor que descobrir na primeira sincronização — e muito
  /// melhor que aceitá-la e cifrar tudo com entropia insuficiente.
  private parseKey(raw: string): Buffer {
    const candidate = /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');

    if (candidate.length !== KEY_LENGTH) {
      throw new Error(
        `FISCAL_CERT_ENCRYPTION_KEY precisa ter 32 bytes (64 hex ou 44 base64). ` +
          `Recebi ${candidate.length} bytes. Gere com: openssl rand -hex 32`,
      );
    }

    // Rejeita a chave toda-zeros, que é o que sai de um `.env` preenchido com
    // placeholder e passaria despercebida.
    if (timingSafeEqual(candidate, Buffer.alloc(KEY_LENGTH))) {
      throw new Error('FISCAL_CERT_ENCRYPTION_KEY não pode ser uma chave nula.');
    }

    return candidate;
  }
}
