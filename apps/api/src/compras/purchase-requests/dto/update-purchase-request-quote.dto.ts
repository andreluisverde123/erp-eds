import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class PurchaseRequestQuoteItemDto {
  @IsUUID(undefined, { message: 'Item inválido.' })
  id!: string;

  @IsNumber({}, { message: 'Valor unitário inválido.' })
  @Min(0)
  @Max(999_999_999.99, { message: 'Valor unitário excede o limite permitido.' })
  estimatedUnitPrice!: number;
}

/// Cotação: o único jeito de gravar valor unitário depois que ele saiu do
/// formulário de solicitação. Mexe SÓ no preço — descrição, unidade e
/// quantidade continuam sendo do solicitante e não são tocadas aqui.
export class UpdatePurchaseRequestQuoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe o valor de ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestQuoteItemDto)
  items!: PurchaseRequestQuoteItemDto[];
}
