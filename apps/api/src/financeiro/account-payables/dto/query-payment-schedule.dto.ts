import { IsISO8601 } from 'class-validator';

export class QueryPaymentScheduleDto {
  /// Qualquer dia da semana desejada (AAAA-MM-DD). O service normaliza para a
  /// segunda-feira, então a tela pode mandar "hoje" sem calcular nada.
  @IsISO8601({ strict: true }, { message: 'Semana inválida.' })
  week!: string;
}
