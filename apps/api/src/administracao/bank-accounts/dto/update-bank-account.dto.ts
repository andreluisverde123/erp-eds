import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateBankAccountDto } from './create-bank-account.dto';

/// O DONO não é editável.
///
/// Mudar a conta de pessoa não é corrigir um cadastro: é dizer que outra
/// pessoa passa a receber naquele destino, e o registro antigo perderia o
/// rastro de quem já foi pago ali. Quem errou o titular desativa a conta e
/// cadastra a certa.
export class UpdateBankAccountDto extends PartialType(
  OmitType(CreateBankAccountDto, ['ownerType', 'ownerId'] as const),
) {}
