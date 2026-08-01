import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ContractorStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryContractorDto extends PaginationQueryDto {
  /// Busca livre em razão social, nome fantasia e CNPJ/CPF.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ContractorStatus, { message: 'Status inválido.' })
  status?: ContractorStatus;

  @IsOptional()
  @IsString()
  city?: string;
}
