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

  /// O centro de custo da ordem, que Compras informa quando a solicitação veio
  /// sem ele — o solicitante escolhe a obra e nem sempre sabe a conta.
  ///
  /// Opcional no DTO e obrigatório no resultado: o service usa este valor
  /// quando vem, cai no da solicitação quando não vem, e recusa a emissão se
  /// não houver nenhum dos dois. Em `PurchaseOrder` a coluna continua NOT NULL
  /// — nenhuma ordem sai daqui sem atribuição de custo.
  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

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
