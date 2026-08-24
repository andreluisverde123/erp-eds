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

export class CreatePurchaseOrderDto {
  @IsUUID(undefined, { message: 'Solicitação inválida.' })
  purchaseRequestId!: string;

  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId!: string;

  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de entrega inválida.' })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus, { message: 'Status inválido.' })
  status?: PurchaseOrderStatus;

  /// As linhas compradas, cada uma apontando para a linha da solicitação que
  /// a originou. Obrigatório ter ao menos uma: uma ordem sem item é o estado
  /// que esta etapa existe para eliminar.
  ///
  /// As ordens JÁ EMITIDAS antes desta mudança continuam sem itens — a regra
  /// vale para o que nasce daqui em diante, não retroage.
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos um item da solicitação.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];
}
