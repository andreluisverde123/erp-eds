import { IsISO8601, IsUUID } from 'class-validator';

/// Custo de mão de obra de UMA obra num período. Os três obrigatórios: sem
/// obra e sem recorte de tempo a pergunta não existe.
export class QueryLaborCostDto {
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  from!: string;

  @IsISO8601(undefined, { message: 'Data final inválida.' })
  to!: string;
}
