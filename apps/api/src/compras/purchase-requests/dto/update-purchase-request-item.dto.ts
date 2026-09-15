import { OmitType } from '@nestjs/mapped-types';

import { PurchaseRequestItemInputDto } from './purchase-request-item-input.dto';

/// EDITA um item de solicitação já enviada: material (com o vínculo ao
/// cadastro de insumos, quando houver), unidade, quantidade e observação.
///
/// É a linha INTEIRA, não um patch: o formulário mostra os quatro campos e
/// devolve os quatro. Observação ausente limpa a observação; `catalogItemId`
/// ausente desfaz o vínculo — do mesmo jeito que na criação.
///
/// O preço não vem daqui: ele é da cotação, que é de Compras.
export class UpdatePurchaseRequestItemDto extends OmitType(PurchaseRequestItemInputDto, [
  'estimatedUnitPrice',
] as const) {}
