import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE } from './constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { AllowWithTemporaryPassword } from './decorators/password-change-exempt.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { refreshCookieOptions, setRefreshCookie } from './refresh-cookie';
import type { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Limite bem mais apertado que o resto da API — alvo clássico de força bruta.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.logout(refreshToken);
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
  }

  // Isenta do PasswordChangeGuard: o front precisa conseguir ler o perfil
  // (e o próprio `mustChangePassword`) enquanto empurra a tela de troca.
  @AllowWithTemporaryPassword()
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  /// A única rota de escrita liberada para quem ainda está com senha
  /// temporária. Devolve sessão nova (o `mustChangePassword` vive no token) e
  /// invalida as sessões antigas do usuário.
  @AllowWithTemporaryPassword()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date) {
    setRefreshCookie(response, this.configService, token, expiresAt);
  }

  private cookieOptions(): CookieOptions {
    return refreshCookieOptions(this.configService);
  }
}
