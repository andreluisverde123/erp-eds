import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptionVault } from '../../common/crypto/encryption-vault';

/// Cofre do número da conta e da chave PIX.
///
/// Chave PRÓPRIA (`BANK_DATA_ENCRYPTION_KEY`), separada da do certificado
/// fiscal de propósito: são dois materiais com donos e ciclos de vida
/// diferentes, e trocar a chave de um não pode tornar o outro ilegível.
@Injectable()
export class BankAccountCryptoService extends EncryptionVault {
  constructor(configService: ConfigService) {
    super(
      configService.get<string>('BANK_DATA_ENCRYPTION_KEY'),
      'BANK_DATA_ENCRYPTION_KEY',
      'Os dados bancários',
    );
  }
}
