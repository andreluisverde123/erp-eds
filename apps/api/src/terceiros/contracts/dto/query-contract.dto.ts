import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryContractDto extends PaginationQueryDto {
  /// Busca livre em número do contrato e nome da empresa terceirizada.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Empresa terceirizada inválida.' })
  contractorId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  /// Filtra pelo badge exibido na tela (derivado, não uma coluna).
  @IsOptional()
  @IsIn(['ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED'], { message: 'Status inválido.' })
  badgeStatus?: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED';
}
