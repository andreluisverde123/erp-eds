import { IsIn, IsUUID } from 'class-validator';

import { BANK_ACCOUNT_OWNER_TYPES, type BankAccountOwnerType } from '../bank-account-owner';

/// A listagem é SEMPRE de um titular só — não existe "listar todas as contas
/// bancárias da empresa". Uma tela dessas seria um dump de dado sensível, e
/// nenhum fluxo atual precisa dela.
export class QueryBankAccountDto {
  @IsIn(BANK_ACCOUNT_OWNER_TYPES, { message: 'Tipo de titular inválido.' })
  ownerType!: BankAccountOwnerType;

  @IsUUID(undefined, { message: 'Titular inválido.' })
  ownerId!: string;
}
