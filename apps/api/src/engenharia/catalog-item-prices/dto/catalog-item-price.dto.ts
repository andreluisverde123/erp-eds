import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { IsCompositionUnitPrice } from '../../compositions/composition-number.validator';
import { IsDateOnly } from '../date-only.validator';

/// Registro MANUAL de preço de referência.
///
/// Repare no que NÃO está aqui: `source` (é MANUAL por ser esta rota), `unit`
/// (é a do insumo, copiada no servidor), `companyId` e `createdById` (da
/// sessão). Mandar qualquer um deles é recusado com 400.
export class CreateManualPriceDto {
  /// Zero ou positivo, até 4 casas — a mesma regra e a mesma escala do preço
  /// da linha de composição, que é para onde este valor vai ser sugerido.
  @IsCompositionUnitPrice()
  unitPrice!: number | string;

  @IsDateOnly()
  referenceDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo de 500 caracteres.' })
  note?: string;
}

/// Registro de preço a partir de uma linha de ordem de compra recebida. O valor
/// e a data NÃO são informados: vêm da compra.
export class CreatePurchasePriceDto {
  @IsUUID('all', { message: 'Linha de compra inválida.' })
  purchaseOrderItemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo de 500 caracteres.' })
  note?: string;
}

export class QueryPriceHistoryDto extends PaginationQueryDto {}

export class QueryPriceAtDto {
  /// Ausente = hoje.
  @IsOptional()
  @IsDateOnly()
  date?: string;
}
