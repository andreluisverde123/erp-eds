import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { BankAccountType, PixKeyType } from '../../../../generated/prisma/client';
import { BANK_ACCOUNT_OWNER_TYPES, type BankAccountOwnerType } from '../bank-account-owner';

/// Validação de FORMATO por campo. As regras que dependem de outro campo
/// (formato da chave conforme o tipo, titular de terceiro exigindo documento)
/// ficam no service, sobre `bank-account.util.ts` — class-validator não
/// enxerga um campo do outro sem decorator próprio.
///
/// Nenhuma mensagem de erro repete o VALOR recebido: uma mensagem de validação
/// atravessa log de proxy, tela de erro e print de suporte.
export class CreateBankAccountDto {
  @IsIn(BANK_ACCOUNT_OWNER_TYPES, { message: 'Tipo de titular inválido.' })
  ownerType!: BankAccountOwnerType;

  @IsUUID(undefined, { message: 'Titular inválido.' })
  ownerId!: string;

  /// Código COMPE, 3 dígitos, com os zeros à esquerda ("001", "341").
  @IsString()
  @Matches(/^\d{3}$/, { message: 'O código do banco tem 3 dígitos (ex.: 341).' })
  bankCode!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome do banco é obrigatório.' })
  @MaxLength(100)
  bankName!: string;

  @IsString()
  @Matches(/^\d{1,6}$/, { message: 'A agência deve ter de 1 a 6 dígitos, sem o dígito.' })
  branch!: string;

  /// Um caractere: alguns bancos usam "X" como dígito.
  @IsOptional()
  @Matches(/^[0-9Xx]$/, { message: 'O dígito da agência tem um caractere (0-9 ou X).' })
  branchDigit?: string;

  @IsEnum(BankAccountType, { message: 'Tipo de conta inválido.' })
  accountType!: BankAccountType;

  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'A conta deve ter de 1 a 20 dígitos, sem o dígito.' })
  accountNumber!: string;

  @IsOptional()
  @Matches(/^[0-9Xx]$/, { message: 'O dígito da conta tem um caractere (0-9 ou X).' })
  accountDigit?: string;

  /// PIX é opcional, mas tipo e chave andam juntos — a conferência do par está
  /// no service.
  @IsOptional()
  @IsEnum(PixKeyType, { message: 'Tipo de chave PIX inválido.' })
  pixKeyType?: PixKeyType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pixKey?: string;

  /// Preencher SOMENTE quando o titular não for o próprio dono da conta.
  /// Em branco, nome e documento saem do cadastro dele.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  holderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  holderDocument?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
