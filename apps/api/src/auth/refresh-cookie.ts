import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import { REFRESH_TOKEN_COOKIE } from './constants';

/// Cookie restrito a `/auth` — o refresh token só precisa trafegar nas
/// próprias rotas de autenticação, nunca nas chamadas de API em geral.
///
/// Extraído do `AuthController` quando o cadastro self-service passou a
/// precisar emitir a mesma sessão: duas cópias das flags do cookie é o tipo de
/// duplicação que envelhece mal (mudar `sameSite` num lugar e esquecer o outro
/// derruba o refresh só de um dos fluxos, e o sintoma aparece 15 minutos
/// depois, quando o access token expira).
/// O `path` é configurável porque o caminho público das rotas de auth muda
/// conforme o deploy: rodando API e front na mesma origem (nginx servindo o
/// SPA e repassando `/api` para a API), o navegador vê `/api/auth/refresh` e
/// um cookie preso em `/auth` simplesmente não é enviado — a sessão morreria
/// silenciosamente quando o access token expirasse, 15 minutos depois do
/// login. Default `/auth` mantém o comportamento de desenvolvimento.
export function refreshCookieOptions(configService: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: configService.get<string>('NODE_ENV') === 'production',
    path: configService.get<string>('REFRESH_COOKIE_PATH') ?? '/auth',
  };
}

export function setRefreshCookie(
  response: Response,
  configService: ConfigService,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...refreshCookieOptions(configService),
    expires: expiresAt,
  });
}
