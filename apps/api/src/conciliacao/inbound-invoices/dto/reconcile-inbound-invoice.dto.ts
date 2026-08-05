import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaymentMethod, PaymentTerms } from '../../../../generated/prisma/client';

export class ReconcileInboundInvoiceDto {
  /// A ordem de compra escolhida. Vem sempre do cliente, mesmo quando é a
  /// sugestão principal: conciliar é um ato do financeiro, não do sistema —
  /// nada é vinculado sem alguém ter confirmado na tela.
  @IsUUID(undefined, { message: 'Ordem de compra inválida.' })
  purchaseOrderId!: string;

  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida.' })
  paymentMethod!: PaymentMethod;

  @IsEnum(PaymentTerms, { message: 'Condição de pagamento inválida.' })
  paymentTerms!: PaymentTerms;

  /// Data-base dos vencimentos. "30/60/90" conta a partir DELA, não da data de
  /// emissão. Quando omitida, cai na emissão da nota.
  @IsOptional()
  @IsISO8601({}, { message: 'Data de vencimento inválida.' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Observações devem ter no máximo 1000 caracteres.' })
  notes?: string;

  /// Confirmação explícita de que o valor da nota difere do saldo em aberto da
  /// ordem. Sem isto, a API recusa a conciliação divergente — a tela mostra a
  /// diferença destacada e exige o aceite antes de reenviar.
  @IsOptional()
  @IsBoolean()
  acceptDivergence?: boolean;
}
