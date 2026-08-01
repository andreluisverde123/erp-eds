import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PASSWORD_CHANGE_EXEMPT_KEY } from '../decorators/password-change-exempt.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

/// A senha temporária gerada por um admin (criação de usuário ou reset) só
/// serve para uma coisa: entrar e trocar a senha. Sem este guard, a checagem
/// viveria só no frontend — e bastaria chamar a API direto para continuar
/// usando o sistema com uma senha que circulou por WhatsApp.
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  private readonly logger = new Logger(PasswordChangeGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isExempt = this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!request.user?.mustChangePassword) return true;

    this.logger.warn(
      `Bloqueado por senha temporária: usuário=${request.user.sub} rota=${request.method} ${request.originalUrl}`,
    );
    throw new ForbiddenException('Troque sua senha temporária antes de continuar.');
  }
}
