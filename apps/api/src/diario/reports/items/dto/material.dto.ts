import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MaterialMovementType, MaterialUnit } from '../../../../../generated/prisma/client';

/// Teto da quantidade. Sem ele, um zero a mais digitado no celular vira
/// "50.000 sacos de cimento" e contamina o relatório sem nada reclamar.
/// Generoso o bastante para caber uma carga de brita em quilos.
const QUANTIDADE_MAXIMA = 9_999_999;

/// `maxDecimalPlaces: 3` espelha o `Decimal(12,3)` da coluna. Sem isso o
/// Postgres arredondaria silenciosamente `0,0004` para zero — e uma quantidade
/// que vira zero depois de salva é pior que uma recusada na entrada.
const NUMERO = { maxDecimalPlaces: 3 } as const;

const normalizarTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateMaterialDto {
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe o material.' })
  @MaxLength(120, { message: 'O material deve ter no máximo 120 caracteres.' })
  name!: string;

  /// Decimal, e não inteiro: 2,5 m³ de concreto e 150,75 kg de vergalhão são
  /// quantidades normais de obra.
  @IsNumber(NUMERO, { message: 'A quantidade deve ser um número com até 3 casas decimais.' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: 'A quantidade informada é grande demais.' })
  quantity!: number;

  @IsEnum(MaterialUnit, { message: 'Unidade inválida.' })
  unit!: MaterialUnit;

  @IsEnum(MaterialMovementType, { message: 'Tipo de movimentação inválido.' })
  movementType!: MaterialMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;
}

/// Atualização parcial — a tela corrige a quantidade sem reenviar o resto.
export class UpdateMaterialDto {
  @IsOptional()
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe o material.' })
  @MaxLength(120, { message: 'O material deve ter no máximo 120 caracteres.' })
  name?: string;

  @IsOptional()
  @IsNumber(NUMERO, { message: 'A quantidade deve ser um número com até 3 casas decimais.' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: 'A quantidade informada é grande demais.' })
  quantity?: number;

  @IsOptional()
  @IsEnum(MaterialUnit, { message: 'Unidade inválida.' })
  unit?: MaterialUnit;

  @IsOptional()
  @IsEnum(MaterialMovementType, { message: 'Tipo de movimentação inválido.' })
  movementType?: MaterialMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;
}
