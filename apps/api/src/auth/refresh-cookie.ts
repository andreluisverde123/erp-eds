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
/// `REFRESH_COOKIE_DOMAIN` é o que permite ao Diário de Obras
/// (`diario.gestaoeds.com.br`) e ao ERP (`gestaoeds.com.br`) compartilharem
/// UMA sessão: sem `Domain`, o cookie nasce host-only e o navegador
/// simplesmente não o envia para o outro subdomínio — quem entrasse no ERP
/// teria que entrar de novo no Diário, com as mesmas credenciais, por pura
/// mecânica de cookie.
///
/// Fica VAZIO por omissão, e isso é uma decisão de segurança e não um
/// esquecimento: `Domain=.exemplo.com` entrega o cookie a TODO subdomínio do
/// domínio, presente e futuro — inclusive um que venha a ser servido por
/// outro sistema. Ligar isto é declarar "todos os subdomínios deste domínio
/// são meus". Com o valor vazio, cada host mantém a própria sessão e nada
/// muda em relação ao comportamento que existia antes.
export function refreshCookieOptions(configService: ConfigService): CookieOptions {
  const domain = configService.get<string>('REFRESH_COOKIE_DOMAIN');

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: configService.get<string>('NODE_ENV') === 'production',
    path: configService.get<string>('REFRESH_COOKIE_PATH') ?? '/auth',
    // `undefined` (e não string vazia) é o que faz o Express omitir o
    // atributo — uma string vazia viraria `Domain=` no header.
    ...(domain ? { domain } : {}),
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
