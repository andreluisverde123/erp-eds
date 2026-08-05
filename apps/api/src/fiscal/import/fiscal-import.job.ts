import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { FiscalImportService } from './fiscal-import.service';

/// Job da importação, separado do job de download.
///
/// Roda a cada 5 minutos, e não de hora em hora como o download: aqui não há
/// serviço externo nem limite de consumo — é só leitura do próprio banco. O
/// intervalo curto faz a nota aparecer na Conciliação pouco depois de chegar,
/// em vez de esperar o próximo ciclo da SEFAZ.
///
/// Usa a mesma chave `FISCAL_SYNC_ENABLED` do download: se a sincronização
/// está desligada num ambiente, não há documento novo para importar.
@Injectable()
export class FiscalImportJob {
  private readonly logger = new Logger(FiscalImportJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly importer: FiscalImportService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('FISCAL_SYNC_ENABLED') === true;
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'fiscal-import' })
  async executar(): Promise<void> {
    if (!this.enabled) return;

    // Só empresas que têm documento esperando. Um `groupBy` evita varrer
    // todas as empresas para descobrir que não há nada a fazer.
    const pendentes = await this.prisma.fiscalDocument.groupBy({
      by: ['companyId'],
      where: { status: 'FORWARDED' },
      _count: { _all: true },
    });

    for (const empresa of pendentes) {
      try {
        await this.importer.processPending(empresa.companyId);
      } catch (error) {
        // Uma empresa com problema não pode travar as outras.
        this.logger.error(
          `Importação falhou para a empresa ${empresa.companyId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
}
