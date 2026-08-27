import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import type { DiscountType } from '../quote-totals';

/// Um desconto como o usuário informou: em reais (`AMOUNT`) ou em porcentagem
/// (`PERCENT`, 10 = 10%).
///
/// O TETO de 100 aqui só barra o percentual absurdo. Que o desconto não passe
/// da base sobre a qual incide — que é o que realmente importa e depende de
/// preço e quantidade — é checado no service, onde a base existe.
export class DiscountDto {
  @IsIn(['AMOUNT', 'PERCENT'], { message: 'Tipo de desconto inválido.' })
  type!: DiscountType;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor de desconto inválido.' })
  @Min(0, { message: 'O desconto não pode ser negativo.' })
  @Max(999_999_999.99, { message: 'Valor de desconto excede o limite permitido.' })
  value!: number;
}

/// Uma linha da cotação.
///
/// Os três estados que a tela pode enviar, e como cada um chega aqui:
///
///   disponível e cotado   → `estimatedUnitPrice` preenchido
///   disponível e sem cotar → `estimatedUnitPrice` ausente (limpa o preço)
///   não disponível         → `unavailable: true`, sem preço
///
/// Preço é OPCIONAL de propósito. Exigi-lo era o que obrigava o comprador a
/// inventar um valor para o item que o fornecedor não tem. Quem garante que a
/// cotação não chega vazia é o service, que cobra ao menos um item disponível
/// com preço.
export class PurchaseRequestQuoteItemDto {
  @IsUUID(undefined, { message: 'Item inválido.' })
  id!: string;

  @IsOptional()
  @IsNumber({}, { message: 'Valor unitário inválido.' })
  @Min(0)
  @Max(999_999_999.99, { message: 'Valor unitário excede o limite permitido.' })
  estimatedUnitPrice?: number;

  @IsOptional()
  @IsBoolean({ message: 'Disponibilidade inválida.' })
  unavailable?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(200, { message: 'A observação de indisponibilidade é longa demais.' })
  unavailabilityNote?: string;

  /// Desconto DESTA linha, sobre `quantidade × preço unitário`. Ausente é o
  /// mesmo que zero — e é o que apaga um desconto informado antes.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

/// Cotação: o único jeito de gravar valor unitário depois que ele saiu do
/// formulário de solicitação. Mexe SÓ no que a cotação decide — preço e
/// disponibilidade. Descrição, unidade, quantidade e a observação do
/// solicitante continuam sendo dele e não são tocadas aqui.
export class UpdatePurchaseRequestQuoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe o valor de ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestQuoteItemDto)
  items!: PurchaseRequestQuoteItemDto[];

  /// Desconto GERAL da cotação, sobre o subtotal já líquido dos descontos de
  /// item. Ausente é o mesmo que zero — e é o que apaga um desconto geral
  /// informado antes.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}
