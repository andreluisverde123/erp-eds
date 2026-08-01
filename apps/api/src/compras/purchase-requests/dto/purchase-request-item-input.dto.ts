import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class PurchaseRequestItemInputDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o item.' })
  @MaxLength(200)
  description!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a unidade.' })
  @MaxLength(20)
  unit!: string;

  @IsNumber({}, { message: 'Quantidade inválida.' })
  @IsPositive({ message: 'A quantidade deve ser maior que zero.' })
  @Max(1_000_000, { message: 'Quantidade excede o limite permitido.' })
  quantity!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Valor unitário inválido.' })
  @Min(0)
  @Max(999_999_999.99, { message: 'Valor unitário excede o limite permitido.' })
  estimatedUnitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
