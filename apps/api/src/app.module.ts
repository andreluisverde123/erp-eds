import { randomUUID } from 'node:crypto';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AdministracaoModule } from './administracao/administracao.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttachmentsModule } from './attachments/attachments.module';
import { ConciliacaoModule } from './conciliacao/conciliacao.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from './auth/guards/password-change.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CommonModule } from './common/common.module';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { ComprasModule } from './compras/compras.module';
import { envValidationSchema } from './config/env.validation';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { EngenhariaModule } from './engenharia/engenharia.module';
import { FilesModule } from './files/files.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { RhModule } from './rh/rh.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { TerceirosModule } from './terceiros/terceiros.module';
import { TrashModule } from './trash/trash.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    // Logging estruturado (JSON em produção, pretty-print em dev). Substitui
    // o Logger padrão do Nest via `app.useLogger(app.get(Logger))` em
    // main.ts — todo `new Logger(...)`/`this.logger.warn(...)` já existente
    // no código continua funcionando sem alteração, só passa a emitir JSON
    // com request id de correlação em vez de texto simples no console.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.currentPassword',
            'req.body.newPassword',
          ],
          remove: true,
        },
        autoLogging: false, // RequestLoggerMiddleware já cobre isso com o formato próprio do app.
      },
    }),
    // Limite geral pra toda a API — rotas sensíveis (login) usam @Throttle
    // com um limite bem mais apertado por cima deste default.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    EngenhariaModule,
    ComprasModule,
    FinanceiroModule,
    RhModule,
    TerceirosModule,
    ConfiguracoesModule,
    AdministracaoModule,
    // Agendador do job horário da Integração Fiscal. O job em si se
    // desliga por FISCAL_SYNC_ENABLED — aqui só o mecanismo é instalado.
    ScheduleModule.forRoot(),
    ConciliacaoModule,
    FiscalModule,
    RelatoriosModule,
    SearchModule,
    WorkflowModule,
    FilesModule,
    HealthModule,
    AttachmentsModule,
    OnboardingModule,
    StorageModule,
    TrashModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Throttling roda antes de tudo — nem vale a pena verificar JWT/permissão
    // de uma requisição que já estourou o limite.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Ordem importa: autentica primeiro, depois checa papel, depois permissão.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Depois do JWT (precisa de request.user) e antes de papel/permissão: quem
    // está com senha temporária não passa nem para a checagem de permissão.
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Roda depois dos guards (request.user já populado) — carrega quem está
    // fazendo a requisição pra dentro da extensão de auditoria do Prisma.
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
