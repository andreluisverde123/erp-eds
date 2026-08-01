import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreatePaymentDto } from './create-payment.dto';

/// Sem `accountPayableId`: o pagamento não muda de conta depois de criado
/// (estornar/registrar de novo é o caminho, não realocar o registro).
export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['accountPayableId'] as const),
) {}
