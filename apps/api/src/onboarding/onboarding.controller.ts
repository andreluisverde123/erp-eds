import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { setRefreshCookie } from '../auth/refresh-cookie';
import { SignupDto } from './dto/signup.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly configService: ConfigService,
  ) {}

  /// Rota pública que CRIA UMA EMPRESA. No ERP da EDS ela fica desligada:
  /// existe uma empresa só, e ninguém se cadastra sozinho — usuários novos são
  /// criados por um administrador em Configurações → Usuários.
  ///
  /// O endpoint não foi removido porque é o caminho de provisionamento de uma
  /// base nova (homologação, migração de servidor). `PUBLIC_SIGNUP_ENABLED=true`
  /// o reabre deliberadamente, para essa operação e só para ela.
  ///
  /// O limite continua por hora, e não por minuto como o resto da API (teto
  /// global de 100/min): mesmo desligado, uma rota que cria empresa não pode
  /// aceitar rajada.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) response: Response) {
    if (!this.configService.get<boolean>('PUBLIC_SIGNUP_ENABLED')) {
      throw new ForbiddenException('Cadastro público desabilitado.');
    }

    const result = await this.onboardingService.signup(dto);
    setRefreshCookie(
      response,
      this.configService,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return { accessToken: result.accessToken, user: result.user };
  }
}
