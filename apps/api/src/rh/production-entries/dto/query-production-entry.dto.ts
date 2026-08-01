import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryProductionEntryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dateTo?: string;
}
