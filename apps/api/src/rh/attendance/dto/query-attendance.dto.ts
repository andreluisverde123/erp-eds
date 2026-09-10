import { IsBooleanString, IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/// Histórico de presença. Serve tanto para "em quais dias o André trabalhou"
/// quanto para "quem esteve nesta obra nesta semana".
export class QueryAttendanceDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  from?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  to?: string;

  /// `true` devolve só quem trabalhou; `false`, só as ausências apontadas.
  /// Ausente devolve as duas.
  @IsOptional()
  @IsBooleanString({ message: 'Filtro de presença inválido.' })
  present?: string;
}
