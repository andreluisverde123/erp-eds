import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { paginate, type PaginatedResult } from '../common/types/paginated-result.type';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalCertificateService } from './certificate/fiscal-certificate.service';
import { DfeClientService } from './dfe/dfe-client.service';
import { FiscalSyncJob } from './sync/fiscal-sync.job';
import { FiscalSyncService } from './sync/fiscal-sync.service';

export type ConnectionStatus = 'OK' | 'SEM_CERTIFICADO' | 'CERTIFICADO_EXPIRADO' | 'BLOQUEADO' | 'ERRO';

/// Tudo que o painel de Administração > Integração Fiscal exibe, numa
/// requisição só — a tela tem oito indicadores e buscá-los separadamente
/// renderizaria um painel em pedaços.
@Injectable()
export class FiscalIntegrationService {
  private readonly logger = new Logger(FiscalIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: FiscalCertificateService,
    private readonly dfe: DfeClientService,
    private readonly sync: FiscalSyncService,
    private readonly job: FiscalSyncJob,
  ) {}

  async status(companyId: string) {
    const [certificate, estado, ultimaExecucao, totalDocumentos, porTipo] = await Promise.all([
      this.certificates.findInfo(companyId),
      this.sync.obterEstado(companyId),
      this.prisma.fiscalSyncRun.findFirst({
        where: { companyId },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.fiscalDocument.count({ where: { companyId } }),
      this.prisma.fiscalDocument.groupBy({
        by: ['type'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const bloqueado = Boolean(estado.blockedUntil && estado.blockedUntil > new Date());

    return {
      connection: {
        status: this.classificarConexao(certificate, bloqueado),
        /// Ligado só quando o job automático está habilitado no ambiente.
        agendamentoAtivo: this.job.habilitado,
        proximaExecucao: this.job.proximaExecucao(),
        bloqueadoAte: bloqueado ? estado.blockedUntil : null,
        motivoBloqueio: bloqueado ? estado.blockReason : null,
      },
      certificate,
      sync: {
        lastNSU: estado.lastNSU,
        maxNSU: estado.maxNSU,
        /// Quantos documentos a SEFAZ ainda tem para entregar.
        pendentesNaFila: Math.max(0, Number(estado.maxNSU) - Number(estado.lastNSU)),
        lastSyncAt: estado.lastSyncAt,
        lastSuccessAt: estado.lastSuccessAt,
        totalImported: estado.totalImported,
      },
      lastRun: ultimaExecucao,
      documents: {
        total: totalDocumentos,
        porTipo: Object.fromEntries(porTipo.map((linha) => [linha.type, linha._count._all])),
      },
    };
  }

  /// "Testar Conexão": prova o caminho inteiro — decifra o certificado, fecha
  /// o mTLS, monta o SOAP e lê a resposta — SEM avançar o ponteiro NSU.
  ///
  /// Usa `consNSU` (consulta de um NSU específico) justamente por isso: é a
  /// chamada mais barata que ainda exercita tudo, e não consome a fila.
  async testarConexao(companyId: string) {
    const estado = await this.sync.obterEstado(companyId);

    if (estado.blockedUntil && estado.blockedUntil > new Date()) {
      const minutos = Math.ceil((estado.blockedUntil.getTime() - Date.now()) / 60_000);
      throw new BadRequestException(
        `A SEFAZ bloqueou as consultas deste CNPJ por consumo indevido. Aguarde ${minutos} min — cada nova tentativa reinicia a contagem.`,
      );
    }

    const certificate = await this.certificates.loadMaterial(companyId);
    const inicio = Date.now();
    const resposta = await this.dfe.consultarPorNSU(certificate, 35, estado.lastNSU);
    const tempoMs = Date.now() - inicio;

    if (resposta.transportError) {
      return { ok: false, tempoMs, cStat: null, mensagem: resposta.transportError };
    }

    // 137 aqui é SUCESSO: significa que a SEFAZ respondeu, entendeu a consulta
    // e disse "não há documento nesse NSU". O canal está de pé.
    const ok = resposta.cStat !== null && ['137', '138', '589'].includes(resposta.cStat);

    return {
      ok,
      tempoMs,
      cStat: resposta.cStat,
      mensagem: ok
        ? `Conexão estabelecida com a SEFAZ (${resposta.cStat} — ${resposta.xMotivo}).`
        : `A SEFAZ respondeu ${resposta.cStat}: ${resposta.xMotivo}`,
      cnpj: certificate.cnpj,
    };
  }

  async historico(
    companyId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<unknown>> {
    const where = { companyId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fiscalSyncRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { triggeredBy: { select: { id: true, name: true } } },
      }),
      this.prisma.fiscalSyncRun.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  private classificarConexao(
    certificate: { expirado: boolean; isActive: boolean } | null,
    bloqueado: boolean,
  ): ConnectionStatus {
    if (!certificate) return 'SEM_CERTIFICADO';
    if (certificate.expirado) return 'CERTIFICADO_EXPIRADO';
    if (bloqueado) return 'BLOQUEADO';
    if (!certificate.isActive) return 'ERRO';
    return 'OK';
  }
}
