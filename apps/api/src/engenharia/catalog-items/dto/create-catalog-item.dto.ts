import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { CatalogItemType } from '../../../../generated/prisma/client';
import { IsCanonicalUnit } from '../is-canonical-unit.validator';

/// Sem `code`: ele é sequencial e gerado no servidor, como em solicitação,
/// ordem de compra e contrato. Sem `searchKey`: derivado do nome.
export class CreateCatalogItemDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150, { message: 'Máximo de 150 caracteres.' })
  name!: string;

  @IsCanonicalUnit()
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Máximo de 60 caracteres.' })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo de 500 caracteres.' })
  description?: string;

  /// Só `MATERIAL` existe. O campo é aceito para o contrato já nascer explícito
  /// — mão de obra e equipamento virão com modelo de custo próprio.
  @IsOptional()
  @IsEnum(CatalogItemType, { message: 'Tipo de insumo inválido.' })
  type?: CatalogItemType;

  @IsOptional()
  @IsBoolean({ message: 'Situação inválida.' })
  active?: boolean;
}
