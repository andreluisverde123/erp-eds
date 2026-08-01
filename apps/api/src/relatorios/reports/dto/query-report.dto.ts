import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/// DTO único e flexível reaproveitado pelos 5 relatórios (Obras/Compras/
/// Financeiro/RH/Terceiros) — cada endpoint só lê os campos que fazem
/// sentido pra ele; os demais ficam undefined e são ignorados. Evita 5
/// arquivos de DTO quase idênticos para um módulo cujo trabalho real está
/// na consulta agregada, não na validação de entrada.
export class QueryReportDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Fornecedor inválido.' })
  supplierId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Empresa terceirizada inválida.' })
  contractorId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data inicial inválida.' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data final inválida.' })
  dateTo?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'Direção de ordenação inválida.' })
  sortDir?: 'asc' | 'desc';

  /// Só usado pelo endpoint de exportação — ignorado pela listagem paginada.
  @IsOptional()
  @IsIn(['xlsx', 'pdf'], { message: 'Formato de exportação inválido.' })
  format?: 'xlsx' | 'pdf';
}
