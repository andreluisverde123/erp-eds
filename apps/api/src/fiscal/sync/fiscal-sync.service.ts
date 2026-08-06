import { Injectable, Logger } from '@nestjs/common';

import type {
  FiscalSyncStatus,
  FiscalSyncTrigger,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FiscalCertificateService } from '../certificate/fiscal-certificate.service';
import { CSTAT, DfeClientService, type DfeDocument } from '../dfe/dfe-client.service';

/// Espera depois de um bloqueio REAL da SEFAZ (`cStat 656`). Ela fala em 1
/// hora; 65 minutos dão folga para diferença de relógio, porque errar para
/// menos custa outra hora inteira de bloqueio.
const COOLDOWN_AFTER_BLOCK_MINUTES = 65;

/// Espera preventiva depois de "nenhum documento novo" (`cStat 137`). A SEFAZ
/// trata consulta repetida sem novidade como consumo indevido, então o
/// silêncio também precisa de intervalo.
///
/// Precisa ser MENOR que o intervalo do job (1 hora). Com 65 minutos — o mesmo
/// valor do bloqueio real — toda execução seguinte a um resultado vazio caía
/// dentro da janela e era pulada, e a integração passava a sincronizar de duas
/// em duas horas. Medido em staging: 6 execuções puladas sem nenhum 656 real.
const COOLDOWN_AFTER_EMPTY_MINUTES = 50;

/// Teto de páginas por execução. Cada chamada traz ~50 documentos; 20 páginas
/// cobrem 1000 documentos, o que é muito mais que uma hora de movimento
/// normal. O limite existe para que uma carga inicial (50 mil documentos) não
/// prenda o job por horas nem monopolize a conexão com a SEFAZ.
const MAX_PAGES_PER_RUN = 20;

/// Código IBGE por UF — o `cUFAutor` só afeta roteamento interno da SEFAZ.
const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SE: 28, SP: 35, TO: 17,
};

export interface SyncOutcome {
  status: FiscalSyncStatus;
  documentsFound: number;
  documentsImported: number;
  documentsSkipped: number;
  lastNSU: string;
  maxNSU: string;
  message: string | null;
  durationMs: number;
}

@Injectable()
export class FiscalSyncService {
  private readonly logger = new Logger(FiscalSyncService.name);

  /// Trava em memória por empresa. O job horário e o botão "Sincronizar Agora"
  /// podem coincidir, e duas sincronizações concorrentes avançariam o mesmo
  /// ponteiro NSU em paralelo — cada uma pulando os documentos da outra.
  private readonly emAndamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: FiscalCertificateService,
    private readonly dfe: DfeClientService,
  ) {}

  async sync(
    companyId: string,
    trigger: FiscalSyncTrigger,
    triggeredById?: string,
  ): Promise<SyncOutcome> {
    if (this.emAndamento.has(companyId)) {
      return this.registrar(companyId, trigger, triggeredById, new Date(), {
        status: 'SKIPPED',
        documentsFound: 0,
        documentsImported: 0,
        documentsSkipped: 0,
        lastNSU: '',
        maxNSU: '',
        message: 'Já existe uma sincronização em andamento para esta empresa.',
        durationMs: 0,
      });
    }

    this.emAndamento.add(companyId);
    const iniciadoEm = new Date();
    try {
      const resultado = await this.executar(companyId);
      return await this.registrar(companyId, trigger, triggeredById, iniciadoEm, resultado);
    } finally {
      this.emAndamento.delete(companyId);
    }
  }

  private async executar(companyId: string): Promise<SyncOutcome> {
    const inicio = Date.now();
    const estado = await this.obterEstado(companyId);

    // Autocontenção: durante o bloqueio, CADA tentativa reinicia o relógio de
    // 1 hora. Um job horário sem esta guarda transformaria um bloqueio de uma
    // hora em bloqueio permanente.
    if (estado.blockedUntil && estado.blockedUntil > new Date()) {
      const minutos = Math.ceil((estado.blockedUntil.getTime() - Date.now()) / 60_000);
      return {
        status: 'SKIPPED',
        documentsFound: 0,
        documentsImported: 0,
        documentsSkipped: 0,
        lastNSU: estado.lastNSU,
        maxNSU: estado.maxNSU,
        message: `Bloqueio de consumo indevido ativo — faltam ${minutos} min.`,
        durationMs: Date.now() - inicio,
      };
    }

    const certificate = await this.certificates.loadMaterial(companyId);
    const cUFAutor = await this.obterCUFAutor(companyId);

    let lastNSU = estado.lastNSU;
    let maxNSU = estado.maxNSU;
    let encontrados = 0;
    let importados = 0;
    let ignorados = 0;
    let paginas = 0;

    while (paginas < MAX_PAGES_PER_RUN) {
      paginas += 1;
      const resposta = await this.dfe.consultarPorUltimoNSU(certificate, cUFAutor, lastNSU);

      if (resposta.transportError) {
        return {
          status: 'ERROR',
          documentsFound: encontrados,
          documentsImported: importados,
          documentsSkipped: ignorados,
          lastNSU,
          maxNSU,
          message: resposta.transportError,
          durationMs: Date.now() - inicio,
        };
      }

      if (resposta.cStat === CSTAT.CONSUMO_INDEVIDO) {
        // Na rejeição a SEFAZ ECOA o ultNSU correto. É a informação mais
        // valiosa da resposta e sem ela a próxima execução repetiria o erro.
        const sugerido = resposta.ultNSU && Number(resposta.ultNSU) > 0 ? resposta.ultNSU : lastNSU;
        await this.bloquear(companyId, sugerido, resposta.xMotivo ?? 'Consumo indevido.');
        return {
          status: 'ERROR',
          documentsFound: encontrados,
          documentsImported: importados,
          documentsSkipped: ignorados,
          lastNSU: sugerido,
          maxNSU,
          message: `Consumo indevido (656). Bloqueado por ${COOLDOWN_AFTER_BLOCK_MINUTES} min. NSU ajustado para ${sugerido}.`,
          durationMs: Date.now() - inicio,
        };
      }

      maxNSU = resposta.maxNSU ?? maxNSU;

      if (resposta.cStat === CSTAT.NENHUM_DOCUMENTO) {
        // 137 não é erro: é o caso normal quando nada novo chegou. Mas a SEFAZ
        // considera consulta repetida sem novidade como consumo indevido, então
        // o silêncio também precisa de intervalo.
        await this.atualizarEstado(companyId, {
          lastNSU: resposta.ultNSU ?? lastNSU,
          maxNSU,
          lastSyncAt: new Date(),
          lastSuccessAt: new Date(),
          blockedUntil: this.proximaJanela(),
          blockReason: null,
        });
        return {
          status: encontrados > 0 ? 'SUCCESS' : 'EMPTY',
          documentsFound: encontrados,
          documentsImported: importados,
          documentsSkipped: ignorados,
          lastNSU: resposta.ultNSU ?? lastNSU,
          maxNSU,
          message: encontrados > 0 ? null : 'Nenhum documento novo.',
          durationMs: Date.now() - inicio,
        };
      }

      if (resposta.cStat !== CSTAT.DOCUMENTOS_LOCALIZADOS) {
        return {
          status: 'ERROR',
          documentsFound: encontrados,
          documentsImported: importados,
          documentsSkipped: ignorados,
          lastNSU,
          maxNSU,
          message: `SEFAZ retornou ${resposta.cStat}: ${resposta.xMotivo}`,
          durationMs: Date.now() - inicio,
        };
      }

      encontrados += resposta.documents.length;
      const persistidos = await this.persistir(companyId, resposta.documents);
      importados += persistidos.importados;
      ignorados += persistidos.ignorados;

      lastNSU = resposta.ultNSU ?? lastNSU;
      await this.atualizarEstado(companyId, {
        lastNSU,
        maxNSU,
        lastSyncAt: new Date(),
        lastSuccessAt: new Date(),
        totalImported: { increment: persistidos.importados },
      });

      // Enquanto há fila, continuar imediatamente é consumo legítimo — a SEFAZ
      // só reclama de repetição SEM novidade.
      if (Number(lastNSU) >= Number(maxNSU)) break;
    }

    const restou = Number(lastNSU) < Number(maxNSU);
    return {
      status: restou ? 'PARTIAL' : 'SUCCESS',
      documentsFound: encontrados,
      documentsImported: importados,
      documentsSkipped: ignorados,
      lastNSU,
      maxNSU,
      message: restou ? `Ainda há documentos na fila (${lastNSU} de ${maxNSU}).` : null,
      durationMs: Date.now() - inicio,
    };
  }

  /// Grava os XMLs e os encaminha para processamento, tudo numa transação.
  ///
  /// O `skipDuplicates` cobre o caso de uma execução anterior ter gravado o
  /// documento e falhado antes de avançar o ponteiro: reprocessar o mesmo NSU
  /// não pode gerar duplicata.
  private async persistir(companyId: string, documentos: DfeDocument[]) {
    if (documentos.length === 0) return { importados: 0, ignorados: 0 };

    const resultado = await this.prisma.fiscalDocument.createMany({
      data: documentos.map((doc) => ({
        companyId,
        nsu: doc.nsu,
        schema: doc.schema,
        type: doc.type,
        accessKey: doc.accessKey,
        // Prisma 7 tipa `Bytes` como Uint8Array<ArrayBuffer>; `from` garante o
        // ArrayBuffer próprio que o Buffer do Node não oferece.
        xml: Uint8Array.from(doc.xml),
        // Encaminhado no mesmo ato em que é persistido: o documento entra na
        // fila do Processamento Fiscal (sprint seguinte), que consome por
        // `status = FORWARDED`. Esta sprint não abre o XML.
        status: 'FORWARDED',
        forwardedAt: new Date(),
      })),
      skipDuplicates: true,
    });

    const importados = resultado.count;
    const ignorados = documentos.length - importados;

    this.logger.log(
      `Empresa ${companyId}: ${importados} documento(s) persistido(s) e encaminhado(s), ${ignorados} já existente(s).`,
    );

    return { importados, ignorados };
  }

  private async bloquear(companyId: string, nsuSugerido: string, motivo: string) {
    await this.atualizarEstado(companyId, {
      lastNSU: nsuSugerido,
      lastSyncAt: new Date(),
      blockedUntil: new Date(Date.now() + COOLDOWN_AFTER_BLOCK_MINUTES * 60_000),
      blockReason: motivo,
    });
    this.logger.warn(
      `Empresa ${companyId} bloqueada por consumo indevido até ${new Date(Date.now() + COOLDOWN_AFTER_BLOCK_MINUTES * 60_000).toISOString()}.`,
    );
  }

  /// Janela preventiva depois de um lote sem novidade. Encurtada de propósito
  /// para caber DENTRO do intervalo do job: uma janela igual ou maior que ele
  /// faz a execução seguinte ser sempre pulada.
  private proximaJanela(): Date {
    return new Date(Date.now() + COOLDOWN_AFTER_EMPTY_MINUTES * 60_000);
  }

  async obterEstado(companyId: string) {
    return this.prisma.fiscalSyncState.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
  }

  private async atualizarEstado(companyId: string, data: Prisma.FiscalSyncStateUpdateInput) {
    await this.prisma.fiscalSyncState.update({ where: { companyId }, data });
  }

  private async obterCUFAutor(companyId: string): Promise<number> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { state: true },
    });
    // 35 (SP) como reserva: o campo só roteia internamente na SEFAZ e a
    // consulta funciona mesmo com a UF errada — não vale falhar por isto.
    return UF_CODES[company?.state ?? ''] ?? 35;
  }

  private async registrar(
    companyId: string,
    trigger: FiscalSyncTrigger,
    triggeredById: string | undefined,
    startedAt: Date,
    outcome: SyncOutcome,
  ): Promise<SyncOutcome> {
    await this.prisma.fiscalSyncRun.create({
      data: {
        companyId,
        trigger,
        status: outcome.status,
        startedAt,
        finishedAt: new Date(),
        durationMs: outcome.durationMs,
        documentsFound: outcome.documentsFound,
        documentsImported: outcome.documentsImported,
        documentsSkipped: outcome.documentsSkipped,
        nsuFrom: outcome.lastNSU || null,
        nsuTo: outcome.lastNSU || null,
        maxNSU: outcome.maxNSU || null,
        errorMessage: outcome.status === 'ERROR' ? outcome.message : null,
        xMotivo: outcome.status !== 'ERROR' ? outcome.message : null,
        triggeredById: triggeredById ?? null,
      },
    });
    return outcome;
  }
}
