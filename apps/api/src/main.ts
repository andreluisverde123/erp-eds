import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/// `ConfigModule.forRoot({ validationSchema })` (ver `config/env.validation.ts`)
/// já derruba o boot se qualquer env obrigatória faltar/for inválida — JWT
/// secrets, DATABASE_URL, CORS_ORIGIN em produção, credenciais de storage
/// quando `STORAGE_DRIVER=s3`, etc. Não há checagem manual aqui de propósito:
/// duplicar a validação nos dois lugares é como isso ficava dessincronizado.
function resolveCorsOrigins(raw: string | undefined): string[] | string {
  if (!raw) return 'http://localhost:5173';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 1 ? origins : (origins[0] ?? 'http://localhost:5173');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Em produção a API roda atrás de um proxy (nginx, ALB, Fly, Render), então
  // todo request chega com o IP do proxy. Sem confiar no X-Forwarded-For o
  // ThrottlerGuard passa a contar TODO o tráfego como se fosse um único
  // cliente — um usuário sozinho estoura o limite de todo mundo. Fica atrás de
  // uma env porque confiar no header sem proxy na frente é o problema inverso:
  // qualquer cliente forjaria o próprio IP e escaparia do rate limit.
  // O valor é o número de proxies na frente da aplicação (normalmente 1).
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  // SIGTERM (deploy, `docker stop`, rolling update do orquestrador) passa a
  // disparar os hooks de ciclo de vida do Nest — em particular o
  // `onModuleDestroy` do PrismaService, que fecha o pool de conexões em vez de
  // deixá-las penduradas no Postgres até o timeout.
  app.enableShutdownHooks();

  // Arquivos enviados (holerites, documentos, anexos, logo) NÃO são servidos
  // estaticamente — isso ficaria fora do pipeline de guards do Nest e
  // exporia tudo publicamente. Em vez disso, `FilesModule` (controller em
  // `/uploads/*`) exige o mesmo JWT + permissão de módulo que protege o
  // registro dono do arquivo antes de servir o conteúdo.
  // Headers de segurança padrão (X-Content-Type-Options, X-Frame-Options,
  // etc.). CSP desligada — essa API só responde JSON/arquivo, nunca HTML, e
  // uma CSP pensada pra servir página não faz sentido aqui.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  app.use(cookieParser());
  app.enableCors({
    origin: resolveCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `API rodando na porta ${port} (${process.env.NODE_ENV ?? 'development'})`,
  );
}

bootstrap();
