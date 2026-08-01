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

export class CreateProductionEntryDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  @IsISO8601(undefined, { message: 'Data inválida.' })
  date!: string;

  @IsString()
  @IsNotEmpty({ message: 'O serviço executado é obrigatório.' })
  @MaxLength(200)
  description!: string;

  @IsNumber({}, { message: 'Quantidade inválida.' })
  @IsPositive({ message: 'A quantidade deve ser maior que zero.' })
  @Max(1_000_000, { message: 'Quantidade excede o limite permitido.' })
  quantity!: number;

  @IsString()
  @IsNotEmpty({ message: 'A unidade é obrigatória.' })
  @MaxLength(20)
  unit!: string;
}
