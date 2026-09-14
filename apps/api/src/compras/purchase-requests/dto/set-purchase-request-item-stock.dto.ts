import { IsBoolean } from 'class-validator';

/// Marca ou desmarca um item da solicitação como EM ESTOQUE.
export class SetPurchaseRequestItemStockDto {
  @IsBoolean({ message: 'Informe se o item está em estoque.' })
  inStock!: boolean;
}
