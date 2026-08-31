import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { DiscountDto } from '../../dto/discount.dto';

/// Uma linha da ordem de compra, como o cliente a envia.
///
/// Repare no que NÃO está aqui:
///
///  - `description` e `unit` — vêm copiados da linha de origem pelo backend.
///    Pedi-los ao cliente obrigaria a redigitar o que a solicitação já tem e,
///    pior, deixaria a ordem descrever um item diferente do que foi pedido
///    enquanto continuava apontando para ele.
///  - `totalPrice` — é `quantity × unitPrice`, calculado no servidor. Aceitar
///    do cliente é aceitar que o total divirja do cálculo.
export class PurchaseOrderItemInputDto {
  /// A linha da SOLICITAÇÃO que esta linha compra. É este campo — e não o
  /// `purchaseRequestId` da ordem — que sustenta a rastreabilidade por item.
  @IsUUID(undefined, { message: 'Item da solicitação inválido.' })
  purchaseRequestItemId!: string;

  /// A quantidade COMPRADA. Pode diferir da solicitada (compra parcial); o
  /// sistema não impõe igualdade — ver a nota em `PurchaseOrdersService`.
  @IsNumber({}, { message: 'Quantidade inválida.' })
  @IsPositive({ message: 'A quantidade deve ser maior que zero.' })
  @Max(1_000_000, { message: 'Quantidade excede o limite permitido.' })
  quantity!: number;

  /// Preço negociado com o fornecedor. Zero é aceito: brinde e bonificação
  /// entram na ordem com valor zero e mesmo assim precisam ser pedidos.
  @IsNumber({}, { message: 'Valor unitário inválido.' })
  @Min(0, { message: 'O valor unitário não pode ser negativo.' })
  @Max(999_999_999.99, { message: 'Valor unitário excede o limite permitido.' })
  unitPrice!: number;

  /// Desconto DESTA linha. Nasce copiado da linha correspondente da
  /// solicitação e é editável: a ordem é documento próprio, e o comprador pode
  /// ter renegociado. Ausente significa sem desconto, não "mantenha o da
  /// cotação" — a ordem não consulta a solicitação para preencher lacuna.
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
