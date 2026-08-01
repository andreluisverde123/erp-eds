import { IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryCostCenterDto extends PaginationQueryDto {
  /// Busca livre em nome e código.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;
}
