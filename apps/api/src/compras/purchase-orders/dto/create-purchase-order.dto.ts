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

import { DiscountDto } from '../../dto/discount.dto';

export class CreatePurchaseOrderDto {
  @IsUUID(undefined, { message: 'Solicitação inválida.' })
  purchaseRequestId!: string;

  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId!: string;

  /// O centro de custo da ordem, que Compras informa quando a solicitação veio
  /// sem ele — o solicitante escolhe a obra e nem sempre sabe a conta.
  ///
  /// Opcional aqui E no resultado: o service usa este valor quando vem, cai no
  /// da solicitação quando não vem, e aceita a ordem sem nenhum dos dois — a
  /// coluna deixou de ser NOT NULL. Era a única estrita numa cadeia em que a
  /// solicitação, a fatura e a conta a pagar sempre toleraram nulo.
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
  /// Desconto GERAL da ordem, sobre o subtotal já líquido dos descontos de
  /// item. Copiado da solicitação ao gerar, e editável.
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos um item da solicitação.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];
}
