import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { PurchaseRequestItemInputDto } from './purchase-request-item-input.dto';

/// Itens a ACRESCENTAR a uma solicitação já enviada.
///
/// Deliberadamente separado de `UpdatePurchaseRequestDto`: aquele SUBSTITUI a
/// lista inteira (apaga e recria), e é isso que a regra C-4 congela depois do
/// envio. Aqui nada é apagado — só somado —, e é por isso que a operação pode
/// existir com a solicitação já em andamento.
export class AddPurchaseRequestItemsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemInputDto)
  items!: PurchaseRequestItemInputDto[];
}
