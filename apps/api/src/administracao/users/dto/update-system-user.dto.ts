import { PartialType } from '@nestjs/mapped-types';

import { CreateSystemUserDto } from './create-system-user.dto';

/// Sem senha em nenhuma variação: este módulo cuida de identidade e acesso
/// (nome, e-mail, perfil, status). Senha só pelo fluxo dedicado de reset.
export class UpdateSystemUserDto extends PartialType(CreateSystemUserDto) {}
