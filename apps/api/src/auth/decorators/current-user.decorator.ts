import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '../types/jwt-payload.type';

/// Extrai o usuário autenticado (claims do access token) já anexado à request
/// pelo JwtAuthGuard. Uso: `@CurrentUser() user: JwtPayload` ou
/// `@CurrentUser('sub') userId: string` para pegar só um campo.
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return data ? request.user[data] : request.user;
  },
);
