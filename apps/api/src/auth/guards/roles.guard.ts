import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

/// Guard global de autorização por papel. Só entra em ação em rotas anotadas
/// com `@Roles(...)`; sem a decoration, deixa passar (autenticação já foi
/// garantida pelo JwtAuthGuard, que roda antes).
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const { user } = request;
    const allowed = Boolean(user) && requiredRoles.some((role) => user!.roles.includes(role));

    if (!allowed) {
      this.logger.warn(
        `Papel negado: usuário=${user?.sub ?? '—'} rota=${request.method} ${request.originalUrl} exigia=[${requiredRoles.join(',')}]`,
      );
    }

    return allowed;
  }
}
