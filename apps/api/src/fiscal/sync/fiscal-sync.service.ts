import { Injectable, Logger } from '@nestjs/common';

import type { FiscalSyncStatus, FiscalSyncTrigger, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FiscalCertificateService } from '../certificate/fiscal-certificate.service';
import { CSTAT, DfeClientService, type DfeDocument } from '../dfe/dfe-client.service';

/// Espera depois de um bloqueio REAL da SEFAZ (`cStat 656`). Ela fala em 1
/// hora; 65 minutos dão folga para diferença de relógio, porque errar para
/// menos custa outra hora inteira de bloqueio.
const COOLDOWN_AFTER_BLOCK_MINUTES = 65;

/// Espera preventiva depois de "nenhum documento novo" (`cStat 137`). A SEFAZ
/// trata consulta repetida sem novidade como consumo indevido, então o
/// silêncio também precisa de intervalo — de 1 hora, igual ao do bloqueio.
///
/// Já valeu 50 minutos, para caber dentro de um job que rodava de hora em hora.
/// Foi troca de um defeito por outro: parou de pular execuções, mas passou a
/// consultar a cada 60min00s cravados, em cima do limite da SEFAZ. Medido em
/// staging: intervalos entre 59:59.868 e 60:00.069, com 656 em dois deles — a
/// SEFAZ conta do instante em que ELA processou o pedido anterior, então
/// latência e relógio decidem o resultado.
///
/// O valor não pode ser menor que a hora exigida. Quem garante que nenhuma
/// execução se perca é a CADÊNCIA do job (`FiscalSyncJob`, a cada 10 min), não
/// o tamanho desta janela: vencida a espera, a próxima tentativa vem em no
/// máximo 10 minutos. Um job horário não consegue respeitar com folga um
/// intervalo horário — nenhum valor aqui resolveria isso.
const COOLDOWN_AFTER_EMPTY_MINUTES = 65;

/// Teto de páginas por execução. Cada chamada traz ~50 documentos; 20 páginas
/// cobrem 1000 documentos, o que é muito mais que uma hora de movimento
/// normal. O limite existe para que uma carga inicial (50 mil documentos) não
/// prenda o job por horas nem monopolize a conexão com a SEFAZ.
const MAX_PAGES_PER_RUN = 20;

/// Código IBGE por UF — o `cUFAutor` só afeta roteamento interno da SEFAZ.
const UF_CODES: Record<string, number> = {
  AC: 12,
  AL: 27,
  AP: 16,
  AM: 13,
  BA: 29,
  CE: 23,
  DF: 53,
  ES: 32,
  GO: 52,
  MA: 21,
  MT: 51,
  MS: 50,
  MG: 31,
  PA: 15,
  PB: 25,
  PR: 41,
  PE: 26,
  PI: 22,
  RJ: 33,
  RN: 24,
  RS: 43,
  RO: 11,
  RR: 14,
  SC: 42,
  SE: 28,
  SP: 35,
  TO: 17,
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
  /// O `cStat` que a SEFAZ devolveu, quando houve resposta dela. Guardado em
  /// coluna própria porque `errorMessage` é texto livre: sem isto não dá para
  /// separar, no histórico, um 656 de verdade de uma espera nossa.
  cStat?: string | null;
  /// `true` só na espera preventiva entre consultas — que é decisão NOSSA, não
  /// bloqueio da SEFAZ. O job usa isto para não encher o histórico de no-ops.
  preventiveWait?: boolean;
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

      // Espera preventiva em execução automática não é evento: nada foi
      // tentado e nada mudou. Com o job de 10 min seriam ~6 linhas por hora
      // sem informação, afogando no histórico as execuções que importam.
      // Disparo manual continua registrando — quem clicou merece a resposta.
      if (resultado.preventiveWait && trigger === 'SCHEDULED') return resultado;

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
      // Os dois casos usam o mesmo `blockedUntil`, mas são coisas diferentes, e
      // dizer "bloqueado pela SEFAZ" na espera preventiva já levou a crer que a
      // integração tinha sido barrada. Quem separa é o `blockReason`: só o 656
      // de verdade o preenche (ver `bloquear`); a espera preventiva o zera.
      const bloqueioReal = estado.blockReason !== null;
      return {
        status: 'SKIPPED',
        documentsFound: 0,
        documentsImported: 0,
        documentsSkipped: 0,
        lastNSU: estado.lastNSU,
        maxNSU: estado.maxNSU,
        cStat: bloqueioReal ? CSTAT.CONSUMO_INDEVIDO : null,
        preventiveWait: !bloqueioReal,
        message: bloqueioReal
          ? `Bloqueio da SEFAZ por consumo indevido — faltam ${minutos} min.`
          : `Espera preventiva entre consultas — faltam ${minutos} min.`,
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
          cStat: resposta.cStat,
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
          cStat: resposta.cStat,
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
          cStat: resposta.cStat,
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

    // Fila esvaziada é o MESMO estado que "nenhum documento novo": a próxima
    // consulta não teria novidade, e a SEFAZ responde 656 a repetição sem
    // novidade. Sem armar a janela aqui, o lote que termina zerando a fila
    // deixava a porta aberta — foi assim que um "Sincronizar agora" 43 min
    // depois de um lote de 7 documentos levou "Deve ser utilizado o ultNSU nas
    // solicitacoes subsequentes".
    //
    // `PARTIAL` não arma: ali AINDA há fila, e continuar é consumo legítimo.
    if (!restou) {
      await this.atualizarEstado(companyId, {
        blockedUntil: this.proximaJanela(),
        blockReason: null,
      });
    }

    return {
      status: restou ? 'PARTIAL' : 'SUCCESS',
      documentsFound: encontrados,
      documentsImported: importados,
      documentsSkipped: ignorados,
      lastNSU,
      maxNSU,
      cStat: CSTAT.DOCUMENTOS_LOCALIZADOS,
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

  /// Janela preventiva. Armada nos DOIS casos em que a próxima consulta não
  /// teria novidade: `cStat 137` e lote que terminou zerando a fila.
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
        cStat: outcome.cStat ?? null,
        errorMessage: outcome.status === 'ERROR' ? outcome.message : null,
        xMotivo: outcome.status !== 'ERROR' ? outcome.message : null,
        triggeredById: triggeredById ?? null,
      },
    });
    return outcome;
  }
}
