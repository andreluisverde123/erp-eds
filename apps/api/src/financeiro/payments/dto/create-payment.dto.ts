import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';

import { PaymentRecordStatus } from '../../../../generated/prisma/client';

export class CreatePaymentDto {
  @IsUUID(undefined, { message: 'Conta a pagar inválida.' })
  accountPayableId!: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  amount!: number;

  @IsISO8601(undefined, { message: 'Data do pagamento inválida.' })
  paidAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  method?: string;

  @IsOptional()
  @IsEnum(PaymentRecordStatus, { message: 'Status inválido.' })
  status?: PaymentRecordStatus;
}
