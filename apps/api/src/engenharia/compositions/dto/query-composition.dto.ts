import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryCompositionDto extends PaginationQueryDto {
  /// Busca por nome ou código.
  @IsOptional()
  @IsString()
  search?: string;

  /// `true` só as ativas, `false` só as inativas. Ausente traz as duas.
  @IsOptional()
  @IsBooleanString({ message: 'Filtro de situação inválido.' })
  active?: string;
}

/// A busca de insumo para incluir numa composição.
export class QueryCompositionCatalogOptionsDto {
  @IsString()
  @MaxLength(200)
  search!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
