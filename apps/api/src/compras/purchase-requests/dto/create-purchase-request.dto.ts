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

/// Sem `constructionSiteId`: o destino da solicitação é o centro de custo, e a
/// obra (quando existe) é derivada dele no service.
export class CreatePurchaseRequestDto {
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId!: string;

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
