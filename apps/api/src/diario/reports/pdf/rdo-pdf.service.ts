import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { loadCompanyLogo } from '../../../common/pdf/company-logo';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../storage/storage.module';
import { DailyReportsService, type DailyReportDetail } from '../daily-reports.service';
import { abrirDocumentoRdo, renderRdoPdf, type FotoCarregada } from './rdo-pdf-renderer';
import type { MidiaView } from './rdo-pdf-view';
import { buildRdoPdfView } from './rdo-pdf-view';

/// Teto da exportação em lote: um mês de uma obra.
///
/// O PDF inteiro é montado em memória antes de sair, e cada RDO pode trazer
/// dezenas de fotos em resolução de impressão. Sem teto, "todo o período" de
/// todas as obras seria um pedido capaz de derrubar a API para todo mundo.
export const MAX_RDOS_POR_LOTE = 31;

export interface RdoPdf {
  readonly bytes: Buffer;
  readonly nomeArquivo: string;
}

/// Exportação do RDO em PDF.
///
/// **Não tem autorização própria.** Ela começa por `reports.findOne`, o mesmo
/// caminho da tela: existência, vínculo com a obra e o 404 indistinguível para
/// relatório de outra obra saem de lá. Uma checagem paralela aqui seria uma
/// segunda verdade sobre quem pode ler o quê — e a que fica desatualizada é
/// sempre a cópia.
///
/// **Não escreve nada.** Nenhuma linha no banco, nenhum arquivo no storage,
/// nenhuma mudança de situação. Exportar um rascunho o mantém rascunho; o
/// documento apenas carimba a situação em que estava no momento da exportação.
@Injectable()
export class RdoPdfService {
  private readonly logger = new Logger(RdoPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: DailyReportsService,
    private readonly storage: StorageService,
  ) {}

  async export(companyId: string, userId: string, reportId: string): Promise<RdoPdf> {
    const report = await this.reports.findOne(companyId, userId, reportId);

    const empresa = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      // `logoUrl` é a CHAVE do arquivo, não os bytes — quem os lê é
      // `loadCompanyLogo`, logo abaixo.
      select: { tradeName: true, legalName: true, logoUrl: true },
    });

    const view = buildRdoPdfView(report, empresa.tradeName ?? empresa.legalName);
    const fotos = await this.carregarFotos(reportId, view.fotos);
    // Falha na leitura devolve `null` e o RDO sai sem marca, como saía antes.
    // O documento é o registro legal do dia na obra: um enfeite não pode
    // impedir a exportação.
    const logo = await loadCompanyLogo(this.storage, empresa.logoUrl);

    const bytes = await renderRdoPdf({ view, fotos, logo });
    return { bytes, nomeArquivo: view.nomeArquivo };
  }

  /// Vários RDOs num arquivo só — o período que a pessoa escolheu na lista.
  ///
  /// Cada relatório passa pelo MESMO `reports.findOne` da exportação avulsa:
  /// um id de obra não vinculada derruba o lote inteiro com o 404 de sempre,
  /// em vez de sair um PDF silenciosamente menor do que o pedido.
  ///
  /// A ordem é a de arquivo — obra, depois data, depois número —, e não a da
  /// tela, que lista do mais recente para o mais antigo.
  async exportBatch(companyId: string, userId: string, ids: readonly string[]): Promise<RdoPdf> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) {
      throw new BadRequestException('Escolha ao menos um relatório.');
    }
    if (unicos.length > MAX_RDOS_POR_LOTE) {
      throw new BadRequestException(
        `Exporte até ${MAX_RDOS_POR_LOTE} relatórios por arquivo. Reduza o período.`,
      );
    }

    const relatorios: DailyReportDetail[] = [];
    for (const id of unicos) {
      relatorios.push(await this.reports.findOne(companyId, userId, id));
    }
    relatorios.sort(
      (a, b) =>
        a.constructionSite.code.localeCompare(b.constructionSite.code) ||
        a.reportDate.getTime() - b.reportDate.getTime() ||
        a.number - b.number,
    );

    const empresa = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { tradeName: true, legalName: true, logoUrl: true },
    });
    const nomeEmpresa = empresa.tradeName ?? empresa.legalName;
    const logo = await loadCompanyLogo(this.storage, empresa.logoUrl);

    const primeiro = relatorios[0]!;
    const obras = new Set(relatorios.map((r) => r.constructionSite.code));
    // Com mais de uma obra a ordem é por obra, então o primeiro e o último da
    // lista não são o começo e o fim do período.
    const datas = relatorios.map((r) => r.reportDate.toISOString().slice(0, 10)).sort();
    const de = datas[0]!;
    const ate = datas[datas.length - 1]!;
    const obra = obras.size === 1 ? primeiro.constructionSite.code : 'OBRAS';
    const nomeArquivo = `RDOs-${obra}-${de}-a-${ate}.pdf`;

    const documento = abrirDocumentoRdo(
      `RDOs ${obra} — ${de} a ${ate} — ${nomeEmpresa}`,
      nomeEmpresa,
    );
    // Um relatório por vez: as fotos de um são lidas, desenhadas e soltas
    // antes das do seguinte.
    for (const report of relatorios) {
      const view = buildRdoPdfView(report, nomeEmpresa);
      documento.adicionar({ view, fotos: await this.carregarFotos(report.id, view.fotos), logo });
    }

    return { bytes: await documento.fechar(), nomeArquivo };
  }

  /// Lê os arquivos das fotos, na ordem da galeria.
  ///
  /// **O ORIGINAL, e não a miniatura.** A miniatura tem 320 px de maior lado —
  /// suficiente para a grade de três colunas do celular, e insuficiente para
  /// uma célula de meia página A4, onde daria cerca de 90 DPI. O original já
  /// chega limitado a 1920 px pelo navegador antes do upload, o que imprime bem
  /// sem ser um arquivo de câmera inteiro.
  ///
  /// Uma foto por vez, e não `Promise.all`: cinquenta originais carregados
  /// juntos são dezenas de MB parados na memória do processo. Sequencial, o
  /// pico é o PDF em construção mais uma imagem.
  private async carregarFotos(
    reportId: string,
    views: readonly MidiaView[],
  ): Promise<FotoCarregada[]> {
    if (views.length === 0) return [];

    const chaves = new Map(
      (
        await this.prisma.dailyReportMedia.findMany({
          where: { dailyReportId: reportId, type: 'PHOTO' },
          select: { id: true, storageKey: true },
        })
      ).map((linha) => [linha.id, linha.storageKey]),
    );

    const carregadas: FotoCarregada[] = [];

    for (const view of views) {
      const chave = chaves.get(view.id);
      if (!chave) continue;

      try {
        carregadas.push({ view, bytes: await this.lerArquivo(chave) });
      } catch (error) {
        // Uma foto ilegível não pode derrubar a exportação inteira: o RDO tem
        // texto que vale por si, e um relatório sem uma foto é melhor que
        // relatório nenhum. A célula some da grade e o motivo fica no log.
        this.logger.error(
          `Foto "${chave}" do relatório ${reportId} não pôde ser lida para o PDF; seguindo sem ela.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return carregadas;
  }

  private async lerArquivo(chave: string): Promise<Buffer> {
    const stream = await this.storage.getStream(chave);
    const pedacos: Buffer[] = [];

    for await (const pedaco of stream) {
      pedacos.push(Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco as Uint8Array));
    }

    return Buffer.concat(pedacos);
  }
}
