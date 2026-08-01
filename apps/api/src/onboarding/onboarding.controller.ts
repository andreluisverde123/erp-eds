import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
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

  /// Rota pública que CRIA UM TENANT — por isso o limite é por hora, e não por
  /// minuto como o resto da API (o teto global é 100/min). Sem isso, um script
  /// enche o banco de empresas fantasma em segundos.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) response: Response) {
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
