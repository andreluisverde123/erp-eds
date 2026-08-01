import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

import { PurchaseOrderStatus } from '../../../../generated/prisma/client';

export class CreatePurchaseOrderDto {
  @IsUUID(undefined, { message: 'Solicitação inválida.' })
  purchaseRequestId!: string;

  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId!: string;

  @IsNumber({}, { message: 'Valor total inválido.' })
  @IsPositive({ message: 'O valor total deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor total excede o limite permitido.' })
  totalAmount!: number;

  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de entrega inválida.' })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Status inválido.' })
  status?: PurchaseOrderStatus;
}
