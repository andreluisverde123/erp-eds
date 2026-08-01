import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

/// Guard global de autorização por permissão granular. Só entra em ação em
/// rotas anotadas com `@RequirePermissions(...)`; exige que o usuário tenha
/// todas as permissões listadas (AND, não OR).
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const { user } = request;
    const allowed =
      Boolean(user) &&
      requiredPermissions.every((permission) => user!.permissions.includes(permission));

    if (!allowed) {
      this.logger.warn(
        `Permissão negada: usuário=${user?.sub ?? '—'} rota=${request.method} ${request.originalUrl} exigia=[${requiredPermissions.join(',')}]`,
      );
    }

    return allowed;
  }
}
