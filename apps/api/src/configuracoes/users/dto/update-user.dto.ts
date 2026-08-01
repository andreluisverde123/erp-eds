import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateUserDto } from './create-user.dto';

/// Sem `password`: troca de senha só acontece via o fluxo dedicado de reset
/// (ver `POST /users/:id/reset-password`), nunca escondida num PATCH genérico.
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}
