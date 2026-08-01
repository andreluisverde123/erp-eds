import { IsISO8601, IsNumber, IsOptional, IsPositive, Max } from 'class-validator';

/// Sem `invoiceId` (a parcela não muda de nota) nem `status` (é sempre
/// recalculado a partir dos pagamentos — ver AccountPayablesService).
export class UpdateAccountPayableDto {
  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de vencimento inválida.' })
  dueDate?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Valor inválido.' })
  @IsPositive({ message: 'O valor deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Valor excede o limite permitido.' })
  amount?: number;
}
