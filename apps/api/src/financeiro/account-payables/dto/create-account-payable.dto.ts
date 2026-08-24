import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { PaymentMethod } from '../../../../generated/prisma/client';

/// Criação de conta a pagar, nos DOIS caminhos.
///
/// COM `invoiceId`: o comportamento que já existia — a parcela nasce presa a
/// uma nota, e fornecedor e atribuição de custo vêm dela. Mantido intacto para
/// não quebrar quem já chama este endpoint.
///
/// SEM `invoiceId`: o lançamento avulso do Financeiro. Aí não há documento de
/// onde derivar nada, então o que a nota daria passa a ser exigido: a quem se
/// deve (`supplierId`), a que a despesa pertence (`costCenterId`) e o que ela
/// é (`description`) — sem isso a conta seria um valor sem dono nem motivo.
export class CreateAccountPayableDto {
  /// Opcional desde a conta avulsa. Quando vem, manda: os campos abaixo são
  /// ignorados em favor do que a nota diz.
  @IsOptional()
  @IsUUID(undefined, { message: 'Nota fiscal inválida.' })
  invoiceId?: string;

  @ValidateIf((dto: CreateAccountPayableDto) => !dto.invoiceId)
  @IsUUID(undefined, { message: 'Selecione o fornecedor.' })
  supplierId?: string;

  @ValidateIf((dto: CreateAccountPayableDto) => !dto.invoiceId)
  @IsString()
  @IsNotEmpty({ message: 'Informe a descrição da despesa.' })
  @MaxLength(200)
  description?: string;

  /// Centro de custo é OBRIGATÓRIO no lançamento avulso — mesma regra que a
  /// conciliação sem ordem de compra já aplica ("a despesa precisa pertencer
  /// a algum lugar"). A obra é derivada dele e fica nula quando o centro é
  /// administrativo; não é escolhida à parte.
  @ValidateIf((dto: CreateAccountPayableDto) => !dto.invoiceId)
  @IsUUID(undefined, { message: 'Selecione o centro de custo.' })
  costCenterId?: string;

  @IsISO8601(undefined, { message: 'Data de vencimento inválida.' })
  dueDate!: string;

  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  amount!: number;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate?: string;

  /// Formas existentes no sistema (`PaymentMethod`): PIX, cartão, dinheiro e
  /// boleto. Nenhuma modalidade nova foi criada nesta etapa.
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida.' })
  paymentMethod?: PaymentMethod;

  /// Recibo, contrato, fatura de concessionária — o documento que originou a
  /// despesa quando ele não é nota fiscal.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
