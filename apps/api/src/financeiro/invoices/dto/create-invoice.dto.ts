import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID(undefined, { message: 'Ordem de compra inválida.' })
  purchaseOrderId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O número da nota é obrigatório.' })
  @MaxLength(30)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate!: string;

  @IsNumber({}, { message: 'Valor total inválido.' })
  @IsPositive({ message: 'O valor total deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor total excede o limite permitido.' })
  totalAmount!: number;
}
