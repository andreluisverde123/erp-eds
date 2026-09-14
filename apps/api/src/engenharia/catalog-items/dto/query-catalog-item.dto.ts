import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';

import { CatalogItemType } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryCatalogItemDto extends PaginationQueryDto {
  /// Busca por nome ou código. Uma letra já vale — os dois índices cobrem
  /// prefixo e trecho.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /// `true` só os ativos, `false` só os inativos. Ausente traz os dois.
  @IsOptional()
  @IsBooleanString({ message: 'Filtro de situação inválido.' })
  active?: string;

  /// Material, mão de obra ou equipamento. Ausente traz as três naturezas.
  @IsOptional()
  @IsEnum(CatalogItemType, { message: 'Tipo de insumo inválido.' })
  type?: CatalogItemType;
}
