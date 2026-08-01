import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ALLOWED_ENTITY_TYPES } from '../../common/entity-permission.util';

export class CreateWorkflowCommentDto {
  @IsIn(ALLOWED_ENTITY_TYPES, { message: 'Tipo de entidade inválido.' })
  entityType!: string;

  @IsUUID(undefined, { message: 'Entidade inválida.' })
  entityId!: string;

  @IsString()
  @MinLength(1, { message: 'O comentário não pode estar vazio.' })
  @MaxLength(2000)
  body!: string;
}
