import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { DailyReportStatus } from '../../../../generated/prisma/client';

export class QueryDailyReportDto extends PaginationQueryDto {
  /// Sem `siteId` a listagem já vem restrita às obras do usuário. Com um
  /// `siteId` de obra não vinculada, a resposta é 404 — e não uma lista
  /// vazia (ver `SiteAccessService.resolveSiteFilter`).
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  siteId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED'], { message: 'Situação inválida.' })
  status?: DailyReportStatus;

  /// Período pela DATA DO RELATÓRIO, não pela data de criação: quem procura
  /// "os RDOs da semana passada" quer os dias registrados, não os dias em que
  /// alguém digitou. Ambos os limites são inclusivos.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data inicial no formato AAAA-MM-DD.' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data final no formato AAAA-MM-DD.' })
  dateTo?: string;
}
