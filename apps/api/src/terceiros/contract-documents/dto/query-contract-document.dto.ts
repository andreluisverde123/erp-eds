import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryContractDocumentDto extends PaginationQueryDto {
  /// Busca livre em nome do documento e razão social da empresa.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Contrato inválido.' })
  contractId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Empresa terceirizada inválida.' })
  contractorId?: string;

  @IsOptional()
  @IsIn(['VALID', 'EXPIRING', 'EXPIRED'], { message: 'Status inválido.' })
  badgeStatus?: 'VALID' | 'EXPIRING' | 'EXPIRED';
}
