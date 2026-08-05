import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { SystemUserStatus } from '../system-users.service';

export class QuerySystemUserDto extends PaginationQueryDto {
  /// Filtro por nome do usuário (parcial, sem diferenciar maiúsculas).
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Perfil inválido.' })
  roleId?: string;

  /// `PENDING_FIRST_ACCESS` = ativo, mas ainda com a senha temporária que um
  /// admin gerou. Ver `SystemUserStatus` no service.
  @IsOptional()
  @IsIn(['ACTIVE', 'PENDING_FIRST_ACCESS', 'INACTIVE'], { message: 'Status inválido.' })
  status?: SystemUserStatus;
}
