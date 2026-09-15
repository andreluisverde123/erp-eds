import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { ReferenceBasesLoaderService } from './reference-bases-loader.service';

/// Atualização semanal das bases oficiais: toda segunda, 5h de Brasília.
///
/// Semanal, e não diária, porque o SINAPI sai uma vez por mês e o SICRO a
/// cada trimestre; olhar todo dia só acordaria o banco (Neon) e faria
/// centenas de consultas a servidores públicos sem novidade. Com a carga
/// inicial feita, a execução normal só sonda os meses que faltam — cada base
/// nova custa alguns segundos.
///
/// Mantém só a publicação mais recente (SINAPI do mês e SICRO de cada UF,
/// procurados nos últimos 6 meses). Quando sai uma nova, a anterior é removida,
/// a menos que algum orçamento a use — ver `ReferenceBasesLoaderService`.
///
/// Desligado por padrão (`REFERENCE_BASES_AUTO_UPDATE=false`): ler a pasta
/// nacional do SINAPI ocupa ~660 MB de memória por alguns segundos, e a carga
/// inicial (12 meses × 27 UFs) deve rodar pela linha de comando, não dentro
/// da API.
@Injectable()
export class ReferenceBasesJob {
  private readonly logger = new Logger(ReferenceBasesJob.name);
  private readonly enabled: boolean;
  private rodando = false;

  constructor(
    private readonly loader: ReferenceBasesLoaderService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('REFERENCE_BASES_AUTO_UPDATE') === true;
  }

  @Cron('0 5 * * 1', { name: 'bases-referenciais', timeZone: 'America/Sao_Paulo' })
  async executar(): Promise<void> {
    if (!this.enabled || this.rodando) return;
    this.rodando = true;
    try {
      const relatorio = await this.loader.load({ months: 12, latestOnly: true, purge: true });
      this.logger.log(
        `Bases referenciais ${relatorio.window.from} a ${relatorio.window.to}: ${relatorio.imported.length} importada(s), ` +
          `${relatorio.alreadyLoaded} já existiam, ${relatorio.failed.length} falha(s), ${relatorio.purgedDatasets} removida(s).`,
      );
    } catch (error) {
      this.logger.error(
        `Atualização das bases referenciais falhou: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
