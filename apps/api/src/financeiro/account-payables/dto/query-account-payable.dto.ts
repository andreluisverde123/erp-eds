import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { AccountPayableOrigin, AccountPayableStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryAccountPayableDto extends PaginationQueryDto {
  /// Busca livre: descrição e número do documento do lançamento avulso,
  /// número da nota e nome do fornecedor.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AccountPayableStatus, { message: 'Status inválido.' })
  status?: AccountPayableStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  /// Separa o que nasceu de nota do que o Financeiro lançou à mão.
  @IsOptional()
  @IsEnum(AccountPayableOrigin, { message: 'Origem inválida.' })
  origin?: AccountPayableOrigin;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dueDateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dueDateTo?: string;
}
