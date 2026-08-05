import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

import { InboundInvoiceStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryInboundInvoiceDto extends PaginationQueryDto {
  /// Busca por número da nota, nome do emitente ou CNPJ — os três campos que
  /// o financeiro tem em mãos quando vai procurar uma nota específica.
  @IsOptional()
  @IsString()
  search?: string;

  /// Só encontra notas cujo CNPJ já casou com um fornecedor cadastrado. As
  /// notas de emitente desconhecido são achadas pela busca textual.
  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsEnum(InboundInvoiceStatus, { message: 'Status inválido.' })
  status?: InboundInvoiceStatus;

  @IsOptional()
  @IsISO8601({}, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Data final inválida.' })
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor mínimo inválido.' })
  @Min(0)
  amountMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor máximo inválido.' })
  @Min(0)
  amountMax?: number;
}
