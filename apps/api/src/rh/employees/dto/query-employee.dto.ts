import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import {
  CompensationType,
  EmployeeStatus,
  EmploymentType,
} from '../../../../generated/prisma/client';
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

  @IsOptional()
  @IsEnum(EmploymentType, { message: 'Tipo de vínculo inválido.' })
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(CompensationType, { message: 'Tipo de remuneração inválido.' })
  compensationType?: CompensationType;

  /// Filtra por funcionários com alocação ativa (sem data fim ou com data
  /// fim futura) nesta obra.
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;
}
