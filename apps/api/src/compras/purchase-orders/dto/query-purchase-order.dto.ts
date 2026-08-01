import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { PurchaseOrderStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryPurchaseOrderDto extends PaginationQueryDto {
  /// Busca livre em número da ordem e nome do fornecedor.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Status inválido.' })
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Solicitação inválida.' })
  purchaseRequestId?: string;
}
