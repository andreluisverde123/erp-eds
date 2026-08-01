import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/// Cadastro self-service de uma nova empresa. Separado do AuthModule de
/// propósito: aquele cuida de sessão de quem já existe; este cria o tenant.
@Module({
  imports: [AuthModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
