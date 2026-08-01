import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { EmployeeStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryEmployeeDto extends PaginationQueryDto {
  /// Busca livre em nome, CPF e cargo.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus, { message: 'Status inválido.' })
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  position?: string;

  /// Filtra por funcionários com alocação ativa (sem data fim ou com data
  /// fim futura) nesta obra.
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;
}
