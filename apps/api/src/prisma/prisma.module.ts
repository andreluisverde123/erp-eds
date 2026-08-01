import { Global, Module } from '@nestjs/common';

import { createAuditExtension } from '../common/prisma/audit-extension';
import { PrismaService } from './prisma.service';

/// `PrismaService` continua sendo o token de injeção usado por todo o app
/// (nenhum dos ~50 arquivos que fazem `constructor(private prisma: PrismaService)`
/// muda), mas o objeto entregue por essa factory é o cliente ESTENDIDO com a
/// auditoria genérica (ver `common/prisma/audit-extension.ts`) — `$extends`
/// retorna um objeto novo, não muta a instância original, então a extensão só
/// se aplica se for isso que o Nest injeta em todo mundo.
///
/// `$extends()` não preserva os métodos customizados da subclasse
/// (`onModuleInit`), então a conexão acontece aqui dentro, direto na base.
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async () => {
        const base = new PrismaService();
        await base.$connect();
        return base.$extends(createAuditExtension(base));
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
