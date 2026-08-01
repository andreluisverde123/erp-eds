import { IsIn, IsUUID } from 'class-validator';

import { ALLOWED_ENTITY_TYPES } from '../../common/entity-permission.util';

export class QueryWorkflowCommentDto {
  @IsIn(ALLOWED_ENTITY_TYPES, { message: 'Tipo de entidade inválido.' })
  entityType!: string;

  @IsUUID(undefined, { message: 'Entidade inválida.' })
  entityId!: string;
}
