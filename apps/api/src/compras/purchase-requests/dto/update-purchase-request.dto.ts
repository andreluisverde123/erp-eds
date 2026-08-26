import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PurchaseRequestItemInputDto } from './purchase-request-item-input.dto';

/// Não usa PartialType(Create...) porque `items`, quando enviado, precisa
/// continuar validado como lista completa (a grade sempre reenvia o estado
/// inteiro) — não é um patch parcial de itens individuais.
export class UpdatePurchaseRequestDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  /// `null` explícito limpa o centro de custo — diferente de omitir o campo,
  /// que o deixa como está. Sem essa distinção não haveria como desfazer uma
  /// atribuição errada pela edição do rascunho.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string | null;

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
