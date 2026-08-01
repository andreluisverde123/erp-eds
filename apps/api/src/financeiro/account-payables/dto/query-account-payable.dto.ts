import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { AccountPayableStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryAccountPayableDto extends PaginationQueryDto {
  /// Busca livre em número da nota e nome do fornecedor.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AccountPayableStatus, { message: 'Status inválido.' })
  status?: AccountPayableStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dueDateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dueDateTo?: string;
}
