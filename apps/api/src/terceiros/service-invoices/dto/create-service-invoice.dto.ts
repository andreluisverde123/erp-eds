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

/// Nota de serviço de terceirizado, lançada pela Engenharia. Sem contrato: o
/// serviço avulso ("conserto da bomba da fazenda, R$ 1.000") é o caso comum.
export class CreateServiceInvoiceDto {
  @IsUUID(undefined, { message: 'Selecione o terceirizado.' })
  contractorId!: string;

  /// Obra ou centro administrativo (a fazenda, o escritório). A obra da conta
  /// sai do centro de custo, como no resto do sistema.
  @IsUUID(undefined, { message: 'Selecione a obra ou o centro de custo.' })
  costCenterId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe o número da nota.' })
  @MaxLength(50)
  documentNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'Descreva o serviço.' })
  @MaxLength(200)
  description!: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  amount!: number;

  @IsISO8601({ strict: true }, { message: 'Data de vencimento inválida.' })
  dueDate!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Data de emissão inválida.' })
  issueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
