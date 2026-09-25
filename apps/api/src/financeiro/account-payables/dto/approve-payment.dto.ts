import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/// Liberação em lote: é assim que o "resumo de sexta" é feito — marca-se o que
/// pode ser pago e libera tudo de uma vez.
export class ApprovePaymentDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos uma conta.' })
  @ArrayMaxSize(500, { message: 'No máximo 500 contas por vez.' })
  @IsUUID(undefined, { each: true, message: 'Conta inválida.' })
  ids!: string[];
}
