import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryPayslipDto extends PaginationQueryDto {
  /// Busca livre em nome e CPF do funcionário.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000, { message: 'Ano de referência inválido.' })
  @Max(2100, { message: 'Ano de referência inválido.' })
  referenceYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Mês de referência inválido.' })
  @Max(12, { message: 'Mês de referência inválido.' })
  referenceMonth?: number;
}
