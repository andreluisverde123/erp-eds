import { IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QuerySupplierDto extends PaginationQueryDto {
  /// Busca livre em razão social, nome fantasia e CNPJ.
  @IsOptional()
  @IsString()
  search?: string;
}
