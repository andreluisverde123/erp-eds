import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryContractEmployeeDto extends PaginationQueryDto {
  /// Busca livre em nome do funcionário e razão social da empresa.
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
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}
