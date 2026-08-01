import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateInvoiceDto } from './create-invoice.dto';

/// Sem `purchaseOrderId`: a nota não muda de ordem de origem depois de criada.
export class UpdateInvoiceDto extends PartialType(
  OmitType(CreateInvoiceDto, ['purchaseOrderId'] as const),
) {}
