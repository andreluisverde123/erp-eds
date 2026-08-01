import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ConstructionStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryConstructionSiteDto extends PaginationQueryDto {
  /// Busca livre em nome, código e cliente.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ConstructionStatus, { message: 'Status inválido.' })
  status?: ConstructionStatus;

  @IsOptional()
  @IsString()
  city?: string;
}
