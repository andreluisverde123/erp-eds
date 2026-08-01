import { IsEnum } from 'class-validator';

import { PurchaseRequestStatus } from '../../../../generated/prisma/client';

export class UpdatePurchaseRequestStatusDto {
  @IsEnum(PurchaseRequestStatus, { message: 'Status inválido.' })
  status!: PurchaseRequestStatus;
}
