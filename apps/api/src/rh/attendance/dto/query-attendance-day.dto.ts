import { IsISO8601, IsUUID } from 'class-validator';

/// A chamada de um dia: obra e data, as duas obrigatórias. Sem elas a pergunta
/// não existe — "quem trabalhou" só faz sentido com onde e quando.
export class QueryAttendanceDayDto {
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsISO8601(undefined, { message: 'Data inválida.' })
  date!: string;
}
