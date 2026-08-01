import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryUserDto extends PaginationQueryDto {
  /// Busca livre em nome e e-mail.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsUUID(undefined, { message: 'Perfil inválido.' })
  roleId?: string;
}
