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

/// Não usa PartialType(Create...) porque `items`, quando enviado, precisa
/// continuar validado como lista completa (a grade sempre reenvia o estado
/// inteiro) — não é um patch parcial de itens individuais.
export class UpdatePurchaseRequestDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemInputDto)
  items?: PurchaseRequestItemInputDto[];
}
