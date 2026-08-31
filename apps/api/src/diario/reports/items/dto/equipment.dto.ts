import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const QUANTIDADE_MAXIMA = 999;

const normalizarTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateEquipmentDto {
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe o equipamento.' })
  @MaxLength(80, { message: 'O equipamento deve ter no máximo 80 caracteres.' })
  name!: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: `A quantidade deve ser no máximo ${QUANTIDADE_MAXIMA}.` })
  quantity!: number;

  /// Situação do equipamento no dia ("em manutenção", "parado por falta de
  /// operador").
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'A situação deve ter no máximo 200 caracteres.' })
  notes?: string;
}

export class UpdateEquipmentDto {
  @IsOptional()
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe o equipamento.' })
  @MaxLength(80, { message: 'O equipamento deve ter no máximo 80 caracteres.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: `A quantidade deve ser no máximo ${QUANTIDADE_MAXIMA}.` })
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'A situação deve ter no máximo 200 caracteres.' })
  notes?: string;
}
