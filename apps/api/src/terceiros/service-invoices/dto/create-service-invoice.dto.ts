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

  /// Onde o serviço foi feito: UM dos dois. Centro de custo (de obra ou
  /// administrativo — a fazenda, o escritório), e a obra da conta sai dele; ou
  /// a obra direto, para a que ainda não tem centro de custo cadastrado.
  @IsOptional()
  @IsUUID(undefined, { message: 'Selecione a obra ou o centro de custo.' })
  costCenterId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Selecione a obra ou o centro de custo.' })
  constructionSiteId?: string;

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
