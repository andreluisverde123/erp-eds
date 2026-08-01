import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateContractDto {
  @IsUUID(undefined, { message: 'Empresa terceirizada inválida.' })
  contractorId!: string;

  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O escopo é obrigatório.' })
  @MaxLength(500)
  scope!: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  totalValue!: number;

  @IsISO8601(undefined, { message: 'Data de início inválida.' })
  startDate!: string;

  @IsISO8601(undefined, { message: 'Data de fim inválida.' })
  endDate!: string;
}
