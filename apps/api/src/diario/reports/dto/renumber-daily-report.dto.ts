import { IsInt, Max, Min } from 'class-validator';

/// Número novo do RDO. Os relatórios de datas posteriores seguem em sequência
/// (número + 1, + 2, ...); os de datas anteriores não mudam.
export class RenumberDailyReportDto {
  @IsInt({ message: 'Informe um número inteiro.' })
  @Min(1, { message: 'O número precisa ser 1 ou maior.' })
  @Max(99999, { message: 'O número pode ter no máximo 5 dígitos.' })
  number!: number;
}
