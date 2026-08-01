import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { InvoiceStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryInvoiceDto extends PaginationQueryDto {
  /// Busca livre em número da nota e nome do fornecedor.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus, { message: 'Status inválido.' })
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Ordem de compra inválida.' })
  purchaseOrderId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dateTo?: string;
}
