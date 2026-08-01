import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { auditContextStorage } from '../audit-context';

/// Roda depois dos guards (diferente de um middleware), então `request.user`
/// já foi populado pelo JwtAuthGuard. Envolve o handler inteiro num contexto
/// de AsyncLocalStorage que a extensão de auditoria do Prisma lê pra saber
/// quem fez a mudança, sem precisar passar `userId` por cada service.
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      auditContextStorage.run({ userId: user.sub, companyId: user.companyId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
