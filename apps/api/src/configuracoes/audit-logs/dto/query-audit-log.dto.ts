import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { AuditAction } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryAuditLogDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Usuário inválido.' })
  userId?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsEnum(AuditAction, { message: 'Ação inválida.' })
  action?: AuditAction;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dateTo?: string;
}
