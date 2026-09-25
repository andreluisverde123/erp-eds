import { Controller, HttpCode, HttpStatus, NotFoundException, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { setRefreshCookie } from './refresh-cookie';

/// Endereços que contam como "banco na própria máquina".
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/// Liga só com as TRÊS travas: `NODE_ENV=development`, `DEV_LOGIN_EMAIL`
/// definido e o banco nesta máquina. A validação do ambiente já recusa
/// `DEV_LOGIN_EMAIL` em produção (e staging roda como produção); a checagem do
/// banco é a última rede — um `.env` apontado por engano para o Neon não vira
/// uma porta sem senha para dados reais.
export function devLoginEmail(config: {
  nodeEnv?: string;
  email?: string;
  databaseUrl?: string;
}): string | null {
  if (config.nodeEnv !== 'development' || !config.email || !config.databaseUrl) return null;
  try {
    const host = new URL(config.databaseUrl).hostname;
    return LOCAL_DB_HOSTS.has(host) ? config.email : null;
  } catch {
    return null;
  }
}

/// LOGIN DE DESENVOLVIMENTO: entra sem senha no ambiente local, com uma
/// sessão de verdade (token e cookie de refresh reais), para o menu e as telas
/// funcionarem como com login. O site local chama isto sozinho quando está com
/// `VITE_DEV_AUTH_BYPASS=true` e não há sessão.
///
/// Fora do ambiente local responde 404, como se a rota não existisse.
@Controller('auth')
export class DevAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('dev-login')
  async devLogin(@Res({ passthrough: true }) response: Response) {
    const email = devLoginEmail({
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      email: this.configService.get<string>('DEV_LOGIN_EMAIL'),
      databaseUrl: this.configService.get<string>('DATABASE_URL'),
    });
    if (!email) throw new NotFoundException();

    const result = await this.authService.devLogin(email);
    setRefreshCookie(
      response,
      this.configService,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return { accessToken: result.accessToken, user: result.user };
  }
}
