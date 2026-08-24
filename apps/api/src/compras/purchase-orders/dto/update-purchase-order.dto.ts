import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { PurchaseOrderStatus } from '../../../../generated/prisma/client';
import { PurchaseOrderItemInputDto } from './purchase-order-item-input.dto';

/// Sem `purchaseRequestId` aqui de propósito: a ordem nasce vinculada a uma
/// solicitação e não muda de "dono" depois de criada.
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de entrega inválida.' })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Status inválido.' })
  status?: PurchaseOrderStatus;

  /// Quando enviado, SUBSTITUI a lista inteira — não acrescenta. Reenviar a
  /// mesma lista deixa a ordem exatamente como estava, em vez de duplicar as
  /// linhas. Omitir o campo não mexe nos itens.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'A ordem precisa de ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items?: PurchaseOrderItemInputDto[];
}
