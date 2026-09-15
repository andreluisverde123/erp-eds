import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { BRAZILIAN_UFS } from '../parsing/locations';
import type { ParsedReferenceDataset } from '../parsing/reference-types';
import { classifySicroFile, parseSicroReports } from '../parsing/sicro-parser';
import { readSinapiWorkbook } from '../parsing/sinapi-parser';
import { hashDosArquivos, ReferenceDatasetsService } from '../reference-datasets.service';
import { extractFiles } from './archive';
import {
  previousCompetences,
  SICRO_REGIME,
  sicroPackageUrl,
  SINAPI_REGIMES,
  sinapiPackageUrl,
} from './official-sources';
import { downloadPackage } from './package-download';

export type OfficialSource = 'SINAPI' | 'SICRO';

/// Marca, no `metadata` do dataset, o que entrou pela carga automática. A
/// limpeza só remove o que tem essa marca: base enviada por alguém pela tela
/// nunca é apagada por aqui.
export const CARGA_AUTOMATICA = 'CARGA_AUTOMATICA';

export interface LoadOptions {
  /// Quantas competências para trás, a partir do mês anterior ao corrente.
  /// No modo `latestOnly`, é até onde procurar a publicação mais recente.
  months: number;
  /// Só a publicação mais recente: o SINAPI mais novo e, para cada UF, o SICRO
  /// mais novo. É o modo da produção — cada competência completa ocupa
  /// ~375 MB, e o orçamento usa a referência vigente.
  latestOnly?: boolean;
  sources?: OfficialSource[];
  ufs?: string[];
  /// Empresa registrada como importadora. Padrão: a mais antiga do banco.
  companyId?: string;
  /// Remove as bases automáticas que ficaram para trás: fora da janela, ou,
  /// no modo `latestOnly`, mais antigas que a última da mesma fonte/UF/regime.
  purge?: boolean;
  today?: Date;
}

export interface LoadReport {
  window: { from: string; to: string };
  imported: string[];
  alreadyLoaded: number;
  /// Pacotes que a fonte não publicou (mês sem SINAPI, trimestre sem SICRO).
  unavailable: string[];
  failed: { base: string; message: string }[];
  purgedDatasets: number;
  purgedEditions: number;
}

interface Contexto {
  companyId: string;
  relatorio: LoadReport;
  existentes: Set<string>;
}

/// O que aconteceu com uma competência: `existe` (já estava no banco),
/// `indisponivel` (a fonte não publicou) ou `processada` (baixada — gravada ou
/// com falha, que sai no relatório).
type Resultado = 'existe' | 'indisponivel' | 'processada';

const chaveDe = (source: string, competence: string, uf: string, regime: string) =>
  `${source}|${competence}|${uf}|${regime}`;

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

/// CARGA DAS BASES OFICIAIS GRATUITAS (SINAPI e SICRO, 27 UFs).
///
/// Baixa direto da CAIXA e do DNIT e grava pelo mesmo caminho da importação
/// pela tela (`ReferenceDatasetsService.importParsed`). É idempotente: só
/// baixa o que ainda falta, e uma base que já existe é pulada. Uma base com
/// problema não impede as outras; tudo sai no relatório.
///
/// Dois modos: janela (as N competências anteriores) e `latestOnly` (só a
/// publicação mais recente de cada fonte/UF).
///
/// Roda pela linha de comando (`loader/cli.ts`, a carga inicial) e pelo job
/// semanal (`reference-bases.job.ts`), que só encontra a publicação nova.
@Injectable()
export class ReferenceBasesLoaderService {
  private readonly logger = new Logger(ReferenceBasesLoaderService.name);

  /// Rede e 7-Zip, substituíveis nos testes.
  download = downloadPackage;
  extract = extractFiles;

  constructor(
    private readonly prisma: PrismaService,
    private readonly datasets: ReferenceDatasetsService,
  ) {}

  async load(opcoes: LoadOptions): Promise<LoadReport> {
    const competencias = previousCompetences(opcoes.months, opcoes.today);
    const ufs = (opcoes.ufs?.length ? opcoes.ufs : BRAZILIAN_UFS).map((uf) =>
      uf.trim().toUpperCase(),
    );
    const fontes: OfficialSource[] = opcoes.sources?.length ? opcoes.sources : ['SINAPI', 'SICRO'];

    const ctx: Contexto = {
      companyId: opcoes.companyId ?? (await this.empresaPadrao()),
      existentes: await this.existentes(competencias),
      relatorio: {
        window: { from: competencias.at(-1)!, to: competencias[0]! },
        imported: [],
        alreadyLoaded: 0,
        unavailable: [],
        failed: [],
        purgedDatasets: 0,
        purgedEditions: 0,
      },
    };

    if (opcoes.latestOnly) {
      if (fontes.includes('SINAPI')) await this.ultimaSinapi(ctx, competencias, ufs);
      if (fontes.includes('SICRO')) await this.ultimaSicro(ctx, competencias, ufs);
    } else {
      // Da competência mais nova para a mais antiga: se a carga for
      // interrompida, o que já entrou é o que mais se usa.
      for (const competencia of competencias) {
        if (
          fontes.includes('SINAPI') &&
          (await this.carregarSinapi(ctx, competencia, ufs)) === 'indisponivel'
        ) {
          ctx.relatorio.unavailable.push(`SINAPI ${competencia}`);
        }
        if (fontes.includes('SICRO')) {
          const naoPublicadas: string[] = [];
          for (const uf of ufs) {
            if ((await this.carregarSicro(ctx, competencia, uf)) === 'indisponivel')
              naoPublicadas.push(uf);
          }
          if (naoPublicadas.length > 0) {
            ctx.relatorio.unavailable.push(`SICRO ${competencia}: ${naoPublicadas.length} UF(s)`);
          }
        }
      }
    }

    if (opcoes.purge) {
      if (opcoes.latestOnly) await this.limparAntigas(ctx, fontes);
      else await this.limparForaDaJanela(ctx, fontes, competencias.at(-1)!);
    }
    return ctx.relatorio;
  }

  /// A competência mais nova do SINAPI que a CAIXA publicou (ou que já está no
  /// banco). A busca para na primeira encontrada.
  private async ultimaSinapi(ctx: Contexto, competencias: string[], ufs: string[]) {
    for (const competencia of competencias) {
      const resultado = await this.carregarSinapi(ctx, competencia, ufs);
      if (resultado !== 'indisponivel') return;
      ctx.relatorio.unavailable.push(`SINAPI ${competencia}`);
    }
    ctx.relatorio.failed.push({
      base: 'SINAPI',
      message: `nenhuma publicação nos últimos ${competencias.length} meses`,
    });
  }

  /// Para cada UF, o SICRO mais novo. As UFs saem em trimestres diferentes
  /// (o Norte costuma atrasar), por isso a busca é por UF.
  private async ultimaSicro(ctx: Contexto, competencias: string[], ufs: string[]) {
    for (const uf of ufs) {
      let achou = false;
      for (const competencia of competencias) {
        if ((await this.carregarSicro(ctx, competencia, uf)) !== 'indisponivel') {
          achou = true;
          break;
        }
      }
      if (!achou) {
        ctx.relatorio.failed.push({
          base: `SICRO ${uf}`,
          message: `nenhuma publicação nos últimos ${competencias.length} meses`,
        });
      }
    }
  }

  private async carregarSinapi(
    ctx: Contexto,
    competencia: string,
    ufs: string[],
  ): Promise<Resultado> {
    const faltando = SINAPI_REGIMES.map(
      (regime) =>
        [
          regime,
          ufs.filter((uf) => !ctx.existentes.has(chaveDe('SINAPI', competencia, uf, regime))),
        ] as const,
    );
    const quantas = faltando.reduce((total, [, lista]) => total + lista.length, 0);
    ctx.relatorio.alreadyLoaded += ufs.length * SINAPI_REGIMES.length - quantas;
    if (quantas === 0) return 'existe';

    const rotulo = `SINAPI ${competencia}`;
    let pasta: { name: string; buffer: Buffer };
    try {
      const pacote = await this.download(sinapiPackageUrl(competencia), 'zip');
      // Quem registra o mês não publicado no relatório é quem chamou.
      if (!pacote) return 'indisponivel';
      // O zip traz outras pastas (manutenções, mão de obra, famílias). O nome
      // vem com acento em codificação antiga; o padrão não depende dele.
      const arquivos = await this.extract(pacote, 'zip', (nome) =>
        /^SINAPI_Refer.*_\d{4}_\d{2}\.xlsx$/i.test(nome),
      );
      if (arquivos.length !== 1)
        throw new Error(`o pacote traz ${arquivos.length} pasta(s) "SINAPI_Referência"`);
      pasta = arquivos[0]!;
    } catch (erro) {
      this.falhou(ctx, rotulo, erro);
      return 'processada';
    }

    const nomeOficial = `SINAPI_Referência_${competencia.replace('-', '_')}.xlsx`;
    const fileHash = hashDosArquivos([{ originalname: nomeOficial, buffer: pasta.buffer }]);

    for (const [regime, lista] of faltando) {
      if (lista.length === 0) continue;
      let leitura: Awaited<ReturnType<typeof readSinapiWorkbook>>;
      try {
        leitura = await readSinapiWorkbook(pasta.buffer, regime);
      } catch (erro) {
        this.falhou(ctx, `${rotulo} ${regime}`, erro);
        continue;
      }
      for (const uf of lista) {
        await this.gravar(
          ctx,
          `${rotulo} ${uf} ${regime}`,
          competencia,
          uf,
          () => leitura.dataset(uf),
          [nomeOficial],
          fileHash,
        );
      }
    }
    return 'processada';
  }

  private async carregarSicro(ctx: Contexto, competencia: string, uf: string): Promise<Resultado> {
    if (ctx.existentes.has(chaveDe('SICRO', competencia, uf, SICRO_REGIME))) {
      ctx.relatorio.alreadyLoaded++;
      return 'existe';
    }
    const rotulo = `SICRO ${competencia} ${uf}`;
    let arquivos: { name: string; buffer: Buffer }[];
    try {
      const pacote = await this.download(sicroPackageUrl(uf, competencia), '7z');
      if (!pacote) return 'indisponivel';
      // Só os relatórios que o parser usa: o pacote traz também os PDFs e
      // os relatórios de encargos e origem de preços.
      arquivos = await this.extract(pacote, '7z', (nome) => classifySicroFile(nome).kind !== null);
    } catch (erro) {
      this.falhou(ctx, rotulo, erro);
      return 'processada';
    }
    await this.gravar(
      ctx,
      rotulo,
      competencia,
      uf,
      () => parseSicroReports(arquivos),
      arquivos.map((arquivo) => arquivo.name),
      hashDosArquivos(
        arquivos.map((arquivo) => ({ originalname: arquivo.name, buffer: arquivo.buffer })),
      ),
    );
    return 'processada';
  }

  private async gravar(
    ctx: Contexto,
    rotulo: string,
    competencia: string,
    uf: string,
    ler: () => ParsedReferenceDataset | Promise<ParsedReferenceDataset>,
    fileNames: string[],
    fileHash: string,
  ) {
    try {
      const parsed = await ler();
      // O pacote de um mês/UF precisa conter aquele mês e aquela UF: um
      // endereço que passasse a servir outro arquivo gravaria a base errada.
      if (parsed.errors.length === 0 && (parsed.competence !== competencia || parsed.uf !== uf)) {
        throw new Error(`o pacote contém ${parsed.competence ?? '?'} ${parsed.uf ?? '?'}`);
      }
      const marcado = { ...parsed, metadata: { ...parsed.metadata, origin: CARGA_AUTOMATICA } };
      await this.datasets.importParsed(ctx.companyId, null, marcado, { fileNames, fileHash });
      ctx.relatorio.imported.push(rotulo);
      this.logger.log(`${rotulo}: importada.`);
    } catch (erro) {
      // Outra carga (ou alguém pela tela) gravou a mesma base antes.
      if (erro instanceof ConflictException) {
        ctx.relatorio.alreadyLoaded++;
        return;
      }
      this.falhou(ctx, rotulo, erro);
    }
  }

  /// Modo janela: bases automáticas das fontes carregadas, anteriores à
  /// janela e que nenhum orçamento usa — o item de orçamento guarda o preço,
  /// mas a ligação com a base continua valendo como rastreio.
  private async limparForaDaJanela(ctx: Contexto, fontes: OfficialSource[], maisAntiga: string) {
    const datasets = await this.prisma.referenceDataset.deleteMany({
      where: {
        source: { in: fontes },
        competence: { lt: maisAntiga },
        metadata: { path: ['origin'], equals: CARGA_AUTOMATICA },
        budgetItems: { none: {} },
      },
    });
    ctx.relatorio.purgedDatasets = datasets.count;
    await this.limparEdicoesVazias(ctx);
  }

  /// Modo `latestOnly`: para cada fonte/UF/regime, as bases automáticas mais
  /// antigas que a mais recente que existe (automática ou enviada pela tela),
  /// desde que nenhum orçamento as use.
  private async limparAntigas(ctx: Contexto, fontes: OfficialSource[]) {
    const linhas = await this.prisma.referenceDataset.findMany({
      where: { source: { in: fontes }, versionLabel: '' },
      select: { id: true, source: true, uf: true, regime: true, competence: true, metadata: true },
    });
    const maisRecente = new Map<string, string>();
    for (const linha of linhas) {
      const chave = `${linha.source}|${linha.uf}|${linha.regime}`;
      if ((maisRecente.get(chave) ?? '') < linha.competence)
        maisRecente.set(chave, linha.competence);
    }
    const antigas = linhas
      .filter(
        (linha) => (linha.metadata as { origin?: string } | null)?.origin === CARGA_AUTOMATICA,
      )
      .filter(
        (linha) =>
          linha.competence < maisRecente.get(`${linha.source}|${linha.uf}|${linha.regime}`)!,
      )
      .map((linha) => linha.id);

    if (antigas.length > 0) {
      const datasets = await this.prisma.referenceDataset.deleteMany({
        where: { id: { in: antigas }, budgetItems: { none: {} } },
      });
      ctx.relatorio.purgedDatasets = datasets.count;
    }
    await this.limparEdicoesVazias(ctx);
  }

  private async limparEdicoesVazias(ctx: Contexto) {
    const edicoes = await this.prisma.referenceEdition.deleteMany({
      where: { datasets: { none: {} } },
    });
    ctx.relatorio.purgedEditions = edicoes.count;
  }

  private falhou(ctx: Contexto, base: string, erro: unknown) {
    ctx.relatorio.failed.push({ base, message: mensagem(erro) });
    this.logger.warn(`${base}: ${mensagem(erro)}`);
  }

  private async existentes(competencias: string[]) {
    const linhas = await this.prisma.referenceDataset.findMany({
      where: { competence: { in: competencias }, versionLabel: '' },
      select: { source: true, competence: true, uf: true, regime: true },
    });
    return new Set(
      linhas.map((linha) => chaveDe(linha.source, linha.competence, linha.uf, linha.regime)),
    );
  }

  private async empresaPadrao() {
    const empresa = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!empresa) throw new Error('Nenhuma empresa cadastrada para registrar a carga das bases.');
    return empresa.id;
  }
}
