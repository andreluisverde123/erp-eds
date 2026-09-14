import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsUUID } from 'class-validator';

import {
  IsCompositionCoefficient,
  IsCompositionUnitPrice,
} from '../composition-number.validator';

/// Uma linha da composição.
///
/// Repare no que NÃO está aqui:
///
///  - `totalCost` — é coeficiente × preço, calculado no servidor. Como a
///    validação global usa `forbidNonWhitelisted`, mandá-lo no corpo é
///    recusado com 400 antes de chegar ao service.
///  - `unit` — é a do insumo (`CatalogItem.unit`). O coeficiente é expresso
///    nela, e aceitar outra unidade aqui abriria a porta para 12,5 "SC" de um
///    insumo cadastrado em KG.
///
/// Número ou texto numérico: "0.000123" em texto chega sem passar pelo ponto
/// flutuante do JavaScript. Os validadores usam a regra de
/// `composition-cost.ts`, e o service a confere de novo.
export class CreateCompositionItemDto {
  @IsUUID('all', { message: 'Insumo inválido.' })
  catalogItemId!: string;

  /// Quanto do insumo, NA UNIDADE DELE, para produzir uma unidade da
  /// composição. 12,5 de um insumo em KG numa composição em M2 = 12,5 kg/m².
  @IsCompositionCoefficient()
  coefficient!: number | string;

  /// Preço de UMA unidade do insumo, nesta composição.
  @IsCompositionUnitPrice()
  unitPrice!: number | string;
}

/// O insumo da linha não se troca: trocar o insumo é remover a linha e incluir
/// outra. Só coeficiente e preço são editáveis.
export class UpdateCompositionItemDto extends PartialType(
  OmitType(CreateCompositionItemDto, ['catalogItemId'] as const),
) {}
