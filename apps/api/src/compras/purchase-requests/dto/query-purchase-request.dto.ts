import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { PurchaseRequestStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryPurchaseRequestDto extends PaginationQueryDto {
  /// Busca livre em número da solicitação, centro de custo e obra.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PurchaseRequestStatus, { message: 'Status inválido.' })
  status?: PurchaseRequestStatus;

  /// Filtro do dia a dia desde que a obra saiu do formulário: a tela lista por
  /// centro de custo, que é o destino que o solicitante realmente escolhe.
  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  /// Mantido para quem agrupa por obra (relatórios e links vindos da tela de
  /// obra). Pega todas as solicitações cujo centro de custo é daquela obra.
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dateTo?: string;
}
