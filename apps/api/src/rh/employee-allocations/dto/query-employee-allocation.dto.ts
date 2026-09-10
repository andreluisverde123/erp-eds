import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryEmployeeAllocationDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  /// Quem estava alocado NESTE dia. É a consulta que o mestre de obras faz
  /// ("obra TJ, 08/09") e a base sobre a qual o RH-03 vai montar a presença.
  ///
  /// Atalho para `from` = `to` = este dia; se vier junto com eles, ganha.
  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inválida.' })
  onDate?: string;

  /// Alocações que tocam o intervalo [`from`, `to`]. Qualquer um dos dois pode
  /// vir sozinho: só `from` é "de tal dia em diante", só `to` é "até tal dia".
  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  from?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  to?: string;
}
