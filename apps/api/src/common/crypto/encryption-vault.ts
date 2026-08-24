import { InternalServerErrorException, Logger } from '@nestjs/common';

import { decryptStringWithKey, encryptStringWithKey, parseEncryptionKey } from './aes-gcm';

/// Cofre de um dado sensível: uma chave de env, cifragem AES-256-GCM e as
/// mensagens de erro que o usuário pode ver.
///
/// A parte difícil não é cifrar — as primitivas estão em `aes-gcm.ts`. É o
/// comportamento em volta da chave, aprendido no primeiro deploy da Integração
/// Fiscal (2026-08-05): resolver a chave no CONSTRUTOR derrubava a aplicação
/// inteira num ambiente que não usava o módulo. Aqui a chave é resolvida no
/// primeiro uso, então a ausência dela falha só para quem tenta abrir o cofre,
/// com uma mensagem que diz o que fazer.
///
/// `FiscalCryptoService` é anterior a esta classe e faz o mesmo por conta
/// própria (inclusive para binário, que só o certificado precisa). Ele não foi
/// migrado de propósito: é módulo em produção, e o ganho seria estético.
export class EncryptionVault {
  private readonly logger: Logger;
  private cachedKey: Buffer | null = null;

  constructor(
    private readonly rawKey: string | undefined,
    /// Nome da variável de ambiente — aparece nas mensagens de erro, que são
    /// lidas por quem configura o servidor.
    private readonly variableName: string,
    /// Como o recurso se chama para o usuário final ("Os dados bancários").
    private readonly featureLabel: string,
  ) {
    this.logger = new Logger(`${EncryptionVault.name}:${variableName}`);
    if (!this.rawKey) {
      this.logger.warn(
        `${variableName} não definida — ${featureLabel} ficam indisponíveis. ` +
          'O restante do sistema não é afetado. Gere com: openssl rand -hex 32',
      );
    }
  }

  /// A tela usa para explicar por que o botão está desabilitado, em vez de
  /// deixar o usuário descobrir com um erro ao clicar.
  get configured(): boolean {
    return Boolean(this.rawKey);
  }

  encryptString(plaintext: string): string {
    return encryptStringWithKey(this.key, plaintext);
  }

  decryptString(payload: string): string {
    try {
      return decryptStringWithKey(this.key, payload);
    } catch {
      // Nunca propagar o erro do OpenSSL: ele varia conforme o motivo e vira
      // oráculo para quem estiver testando entradas.
      this.logger.error('Falha ao decifrar dado protegido — chave trocada ou registro adulterado.');
      throw new InternalServerErrorException(
        'Não foi possível ler o dado protegido. A chave de criptografia pode ter mudado.',
      );
    }
  }

  private get key(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    if (!this.rawKey) {
      throw new InternalServerErrorException(
        `${this.featureLabel} não estão disponíveis neste ambiente: falta a variável ` +
          `${this.variableName}. Gere com \`openssl rand -hex 32\` e reinicie a API.`,
      );
    }
    this.cachedKey = parseEncryptionKey(this.rawKey, this.variableName);
    return this.cachedKey;
  }
}
