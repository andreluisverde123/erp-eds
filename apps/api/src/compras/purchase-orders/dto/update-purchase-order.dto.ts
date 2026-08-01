import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

import { PurchaseOrderStatus } from '../../../../generated/prisma/client';

/// Sem `purchaseRequestId` aqui de propósito: a ordem nasce vinculada a uma
/// solicitação e não muda de "dono" depois de criada.
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Valor total inválido.' })
  @IsPositive({ message: 'O valor total deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor total excede o limite permitido.' })
  totalAmount?: number;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de entrega inválida.' })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Status inválido.' })
  status?: PurchaseOrderStatus;
}
