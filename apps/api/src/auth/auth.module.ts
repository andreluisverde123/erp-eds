import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { DevAuthController } from './dev-auth.controller';
import { AuthService } from './auth.service';
import { DEFAULT_ACCESS_TOKEN_TTL } from './constants';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
            DEFAULT_ACCESS_TOKEN_TTL) as StringValue,
        },
      }),
    }),
  ],
  // `DevAuthController` responde 404 fora do ambiente local (ver as travas nele).
  controllers: [AuthController, DevAuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
