import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  SERVICE_INVOICE_SITUATIONS,
  type ServiceInvoiceSituation,
} from '../service-invoice-situation';

export class QueryServiceInvoiceDto extends PaginationQueryDto {
  /// Terceirizado, número da nota ou descrição do serviço.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Terceirizado inválido.' })
  contractorId?: string;

  @IsOptional()
  @IsIn(SERVICE_INVOICE_SITUATIONS, { message: 'Situação inválida.' })
  situation?: ServiceInvoiceSituation;
}
