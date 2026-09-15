import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ContractPricingType } from '../../../../generated/prisma/client';

export class CreateContractDto {
  @IsUUID(undefined, { message: 'Empresa terceirizada inválida.' })
  contractorId!: string;

  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O objeto do contrato é obrigatório.' })
  @MaxLength(2000, { message: 'O objeto do contrato é longo demais.' })
  scope!: string;

  /// Forma de pagamento, impressa na cláusula de pagamento do PDF. Opcional
  /// na API porque os contratos anteriores ao campo não a têm; a tela de novo
  /// contrato exige.
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'A forma de pagamento é longa demais.' })
  paymentTerms?: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  totalValue!: number;

  @IsISO8601(undefined, { message: 'Data de início inválida.' })
  startDate!: string;

  @IsISO8601(undefined, { message: 'Data de fim inválida.' })
  endDate!: string;

  /// Precificação da empreitada. Ausente = `GLOBAL`, que descreve todo contrato
  /// já cadastrado.
  @IsOptional()
  @IsEnum(ContractPricingType, { message: 'Tipo de precificação inválido.' })
  pricingType?: ContractPricingType;

  /// Só para `UNIT`. Sem preço unitário ou sem medição, o custo do contrato é
  /// DESCONHECIDO — nunca zero.
  @IsOptional()
  @IsNumber({}, { message: 'Preço unitário inválido.' })
  @IsPositive({ message: 'O preço unitário deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Preço unitário excede o limite permitido.' })
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitLabel?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Quantidade medida inválida.' })
  @Min(0, { message: 'A quantidade medida não pode ser negativa.' })
  @Max(999_999_999.999, { message: 'Quantidade medida excede o limite permitido.' })
  measuredQuantity?: number;
}
