import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaymentRecordStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryPaymentDto extends PaginationQueryDto {
  /// Busca livre em número da nota e nome do fornecedor.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PaymentRecordStatus, { message: 'Status inválido.' })
  status?: PaymentRecordStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'Conta a pagar inválida.' })
  accountPayableId?: string;
}
