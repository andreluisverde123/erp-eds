import { IsISO8601, IsNumber, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateAccountPayableDto {
  @IsUUID(undefined, { message: 'Nota fiscal inválida.' })
  invoiceId!: string;

  @IsISO8601(undefined, { message: 'Data de vencimento inválida.' })
  dueDate!: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  amount!: number;
}
