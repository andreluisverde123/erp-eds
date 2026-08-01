import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryEmployeeAllocationDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;
}
