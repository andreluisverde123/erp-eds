import { IsIn, IsNumber, Max, Min } from 'class-validator';

import type { DiscountType } from '../discount';

/// Um desconto como a tela o envia, em reais ou percentual.
///
/// Compartilhado entre a COTAÇÃO e a ORDEM DE COMPRA: as duas aceitam desconto
/// nos mesmos dois níveis, e duas cópias deste DTO divergiriam na primeira vez
/// que alguém ajustasse um limite em só uma delas.
export class DiscountDto {
  @IsIn(['AMOUNT', 'PERCENT'], { message: 'Tipo de desconto inválido.' })
  type!: DiscountType;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor de desconto inválido.' })
  @Min(0, { message: 'O desconto não pode ser negativo.' })
  @Max(999_999_999.99, { message: 'Valor de desconto excede o limite permitido.' })
  value!: number;
}
