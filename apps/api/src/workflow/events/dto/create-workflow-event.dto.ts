import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

import { ALLOWED_ENTITY_TYPES } from '../../common/entity-permission.util';

export class CreateWorkflowEventDto {
  @IsIn(ALLOWED_ENTITY_TYPES, { message: 'Tipo de entidade inválido.' })
  entityType!: string;

  @IsUUID(undefined, { message: 'Entidade inválida.' })
  entityId!: string;

  @IsOptional()
  @IsObject()
  changes?: Record<string, unknown>;
}
