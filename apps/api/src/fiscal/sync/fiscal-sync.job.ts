import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { FiscalSyncService } from './fiscal-sync.service';

/// Job horário da sincronização fiscal.
///
/// Roda para TODA empresa que tenha certificado ativo — o sistema é
/// multi-tenant e cada uma tem o seu ponteiro NSU. As empresas são
/// processadas em SÉRIE, não em paralelo: são chamadas à mesma SEFAZ, e
/// dispará-las juntas transformaria o job num pico de carga contra um serviço
/// público que já limita consumo.
///
/// Desligado por padrão (`FISCAL_SYNC_ENABLED=false`). Isso evita que uma
/// cópia local do banco de produção comece a consultar a SEFAZ com o
/// certificado real — o efeito colateral seria avançar o NSU compartilhado e
/// fazer o ambiente de verdade perder documentos.
@Injectable()
export class FiscalSyncJob {
  private readonly logger = new Logger(FiscalSyncJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: FiscalSyncService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('FISCAL_SYNC_ENABLED') === true;
    this.logger.log(
      this.enabled
        ? 'Sincronização fiscal automática LIGADA (a cada 1 hora).'
        : 'Sincronização fiscal automática desligada (FISCAL_SYNC_ENABLED=false).',
    );
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'fiscal-sync' })
  async executar(): Promise<void> {
    if (!this.enabled) return;

    const empresas = await this.prisma.fiscalCertificate.findMany({
      where: { isActive: true, notAfter: { gt: new Date() } },
      select: { companyId: true, cnpj: true, notAfter: true },
    });

    if (empresas.length === 0) {
      this.logger.debug('Nenhuma empresa com certificado ativo — nada a sincronizar.');
      return;
    }

    for (const empresa of empresas) {
      try {
        const resultado = await this.sync.sync(empresa.companyId, 'SCHEDULED');
        this.logger.log(
          `[${empresa.cnpj}] ${resultado.status} — ${resultado.documentsImported} importado(s), ` +
            `NSU ${resultado.lastNSU}, ${resultado.durationMs}ms.`,
        );
      } catch (error) {
        // Uma empresa com problema não pode impedir as outras de sincronizar.
        // O erro já foi gravado em FiscalSyncRun pelo serviço.
        this.logger.error(
          `[${empresa.cnpj}] falhou: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /// Quando o job roda de novo. Usado pelo painel para exibir "Próxima
  /// execução" sem precisar consultar o scheduler.
  proximaExecucao(): Date | null {
    if (!this.enabled) return null;
    const proxima = new Date();
    proxima.setHours(proxima.getHours() + 1, 0, 0, 0);
    return proxima;
  }

  get habilitado(): boolean {
    return this.enabled;
  }
}
