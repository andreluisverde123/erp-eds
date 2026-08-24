import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  decryptBufferWithKey,
  decryptStringWithKey,
  encryptBufferWithKey,
  encryptStringWithKey,
  parseEncryptionKey,
} from '../../common/crypto/aes-gcm';

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
  private readonly rawKey: string | undefined;
  private cachedKey: Buffer | null = null;

  /// A chave é resolvida na PRIMEIRA USO, não no construtor.
  ///
  /// Com `getOrThrow` no construtor, um ambiente sem `FISCAL_CERT_ENCRYPTION_KEY`
  /// derrubava a aplicação INTEIRA no boot — o ERP todo ficava fora do ar por
  /// causa de um módulo opcional. Aconteceu no primeiro deploy da Integração
  /// Fiscal em 2026-08-05. Agora a ausência da chave só falha quem realmente
  /// tenta usar o cofre, com uma mensagem que diz o que fazer.
  constructor(configService: ConfigService) {
    this.rawKey = configService.get<string>('FISCAL_CERT_ENCRYPTION_KEY');
    if (!this.rawKey) {
      this.logger.warn(
        'FISCAL_CERT_ENCRYPTION_KEY não definida — a Integração Fiscal fica indisponível. ' +
          'O restante do sistema não é afetado. Gere com: openssl rand -hex 32',
      );
    }
  }

  private get key(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    if (!this.rawKey) {
      throw new InternalServerErrorException(
        'A Integração Fiscal não está configurada neste ambiente: falta a variável ' +
          'FISCAL_CERT_ENCRYPTION_KEY. Gere com `openssl rand -hex 32` e reinicie a API.',
      );
    }
    this.cachedKey = this.parseKey(this.rawKey);
    return this.cachedKey;
  }

  /// O painel usa para explicar por que os botões estão desabilitados, em vez
  /// de deixar o usuário descobrir com um erro ao clicar.
  get configurado(): boolean {
    return Boolean(this.rawKey);
  }

  /// Cifra e devolve `iv:authTag:ciphertext` em hex. Os três num campo só
  /// porque separá-los em colunas convidaria alguém a gravar um sem o outro.
  encryptString(plaintext: string): string {
    return encryptStringWithKey(this.key, plaintext);
  }

  decryptString(payload: string): string {
    try {
      return decryptStringWithKey(this.key, payload);
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
    return encryptBufferWithKey(this.key, plaintext);
  }

  decryptBuffer(payload: Buffer): Buffer {
    try {
      return decryptBufferWithKey(this.key, payload);
    } catch {
      this.logger.error('Falha ao decifrar o certificado — chave trocada ou registro adulterado.');
      throw new InternalServerErrorException(
        'Não foi possível ler o certificado protegido. A chave de criptografia pode ter mudado.',
      );
    }
  }

  private parseKey(raw: string): Buffer {
    return parseEncryptionKey(raw, 'FISCAL_CERT_ENCRYPTION_KEY');
  }
}
