import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { FiscalSyncService } from './fiscal-sync.service';

/// Job da sincronização fiscal, a cada 10 minutos.
///
/// A cadência NÃO é o intervalo entre consultas à SEFAZ: quem manda nisso é a
/// janela preventiva de 65 min do `FiscalSyncService`. Rodando com folga acima
/// dela, o job quase sempre só lê o `FiscalSyncState`, vê que a espera não
/// venceu e volta — sem tocar na SEFAZ e sem gravar nada.
///
/// As duas coisas precisam ser independentes. Enquanto o job era horário, a
/// janela tinha de caber dentro de uma hora, e aí a consulta caía em 60min
/// cravados — o limite exato da SEFAZ, que responde 656 quando o pedido chega
/// um décimo de segundo cedo. Separadas, a espera real fica entre 65 e 75
/// minutos: acima do exigido, sem perder a hora seguinte.
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
        ? 'Sincronização fiscal automática LIGADA (verifica a cada 10 min; consulta a SEFAZ no máximo a cada 65 min sem novidade).'
        : 'Sincronização fiscal automática desligada (FISCAL_SYNC_ENABLED=false).',
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'fiscal-sync' })
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
        const linha =
          `[${empresa.cnpj}] ${resultado.status} — ${resultado.documentsImported} importado(s), ` +
          `NSU ${resultado.lastNSU}, ${resultado.durationMs}ms.`;
        // A espera preventiva é o caso comum agora (5 de cada 6 execuções) e
        // não diz nada: fica em debug para não afogar o log das que agiram.
        if (resultado.preventiveWait) this.logger.debug(linha);
        else this.logger.log(linha);
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
  ///
  /// É quando ele VERIFICA, não quando consulta a SEFAZ: se a espera preventiva
  /// ainda estiver de pé, a execução não sai daqui. O painel mostra a espera em
  /// campo próprio (`bloqueadoAte`).
  proximaExecucao(): Date | null {
    if (!this.enabled) return null;
    const proxima = new Date();
    proxima.setMinutes(Math.floor(proxima.getMinutes() / 10) * 10 + 10, 0, 0);
    return proxima;
  }

  get habilitado(): boolean {
    return this.enabled;
  }
}
