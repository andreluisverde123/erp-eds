import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PurchaseRequestItemInputDto } from './purchase-request-item-input.dto';

/// A obra é o destino da solicitação e o centro de custo é complemento —
/// inverso do que era antes, quando só o centro de custo vinha do formulário e
/// a obra saía dele por derivação.
export class CreatePurchaseRequestDto {
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  /// Opcional: quem abre a solicitação nem sempre sabe em qual centro de custo
  /// a compra entra. Compras informa na emissão da Ordem, onde ele volta a ser
  /// obrigatório. Quando vem preenchido, o service exige que pertença à obra.
  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemInputDto)
  items!: PurchaseRequestItemInputDto[];
}
