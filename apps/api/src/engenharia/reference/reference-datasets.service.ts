import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate } from '../../common/types/paginated-result.type';
import { escapeLikePattern } from '../../compras/purchase-requests/search-key';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnlyToDate, dateToDateOnly } from '../catalog-item-prices/reference-date';
import { normalizeCatalogKey } from '../catalog-items/catalog-key';
import {
  QueryReferenceDatasetDto,
  QueryReferenceSearchDto,
  ReferenceImportDto,
} from './dto/reference.dto';
import { competenceStartDate } from './parsing/locations';
import type { ImportIssue, ParsedReferenceDataset } from './parsing/reference-types';
import { parseSicroReports } from './parsing/sicro-parser';
import { parseSinapiReference } from './parsing/sinapi-parser';
import { XlsxInvalidoError } from './parsing/xlsx-rows';

export interface UploadedReferenceFile {
  originalname: string;
  buffer: Buffer;
}

const MAX_ISSUES_NA_RESPOSTA = 100;

/// Linhas por `createMany`. O Postgres aceita no máximo 65.535 parâmetros por
/// comando; o lote é calculado por número de colunas para ficar bem abaixo.
const PARAMETROS_POR_LOTE = 30_000;

/// Tempo máximo da transação de importação. É uma escrita de ~70 mil linhas,
/// feita UMA vez por competência, e precisa ser atômica: o padrão de 5 s do
/// Prisma não é problema de desempenho a esconder, é o tamanho errado para
/// esta operação. Vale só para esta transação.
const TEMPO_DA_IMPORTACAO_MS = 10 * 60 * 1000;

/// BASES REFERENCIAIS (SINAPI, SICRO): prévia, importação e consulta.
///
/// ## Fronteira
///
/// Este service não sabe de abas nem colunas: pede a um parser (`parsing/`) o
/// formato comum `ParsedReferenceDataset` e grava. Fonte nova = parser novo e
/// uma entrada em `parse()`.
///
/// ## Globais e somente leitura
///
/// Os datasets não pertencem a empresa: são dados públicos. Qualquer empresa
/// consulta; importar exige `orcamentos.manage` e fica registrado com a
/// empresa e o usuário. Nenhuma rota altera um dataset importado.
///
/// ## Prévia sem gravar, importação sem estado parcial
///
/// A prévia só lê o arquivo. A confirmação reenvia o arquivo com o hash que a
/// prévia devolveu; o arquivo é lido de novo, e dataset, insumos, composições e
/// linhas analíticas entram numa transação só. Qualquer falha desfaz tudo.
@Injectable()
export class ReferenceDatasetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async preview(dto: ReferenceImportDto, files: UploadedReferenceFile[]) {
    const parsed = await this.parse(dto, files);
    const duplicate = await this.findDuplicate(parsed, dto.versionLabel);
    return resumo(parsed, dto, files, hashDosArquivos(files), duplicate);
  }

  async import(companyId: string, userId: string, dto: ReferenceImportDto, files: UploadedReferenceFile[]) {
    const fileHash = hashDosArquivos(files);
    if (!dto.fileHash) {
      throw new BadRequestException('Analise o arquivo antes de importar: a importação confirma uma prévia.');
    }
    if (dto.fileHash !== fileHash) {
      throw new BadRequestException('O arquivo enviado não é o mesmo que foi analisado. Faça a prévia de novo.');
    }

    const parsed = await this.parse(dto, files);
    if (parsed.errors.length > 0) {
      throw new BadRequestException(
        `A base tem ${parsed.errors.length} erro(s) e não foi importada: ${parsed.errors
          .slice(0, 5)
          .map((erro) => erro.message)
          .join(' ')}`,
      );
    }
    const { competence, uf } = parsed;
    if (!competence || !uf) throw new BadRequestException('Competência ou UF não identificadas.');

    const versionLabel = (dto.versionLabel ?? '').trim();
    if (await this.findDuplicate(parsed, versionLabel)) {
      throw new ConflictException(
        `A base ${parsed.source} ${competence} ${uf} ${parsed.regime}${versionLabel ? ` (${versionLabel})` : ''} já foi importada. Para uma republicação, informe um rótulo de versão.`,
      );
    }

    const datasetId = randomUUID();
    const composicoes = parsed.compositions.map((composicao) => ({ id: randomUUID(), composicao }));
    const componentCount = composicoes.reduce((total, { composicao }) => total + composicao.components.length, 0);

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.referenceDataset.create({
            data: {
              id: datasetId,
              source: parsed.source,
              competence,
              referenceDate: dateOnlyToDate(competenceStartDate(competence)),
              uf,
              locality: parsed.locality,
              regime: parsed.regime,
              versionLabel,
              publishedAt: parsed.publishedAt ? dateOnlyToDate(parsed.publishedAt) : null,
              fileNames: files.map((arquivo) => arquivo.originalname),
              fileHash,
              itemCount: parsed.items.length,
              compositionCount: parsed.compositions.length,
              metadata: parsed.metadata as Prisma.InputJsonValue,
              importedByCompanyId: companyId,
              importedById: userId,
            },
          });

          for (const lote of lotes(parsed.items, 8)) {
            await tx.referenceItem.createMany({
              data: lote.map((item) => ({
                datasetId,
                code: item.code,
                description: item.description,
                searchKey: normalizeCatalogKey(item.description),
                unit: item.unit,
                category: item.category,
                unitPrice: item.unitPrice,
                metadata: item.metadata as Prisma.InputJsonValue,
              })),
            });
          }

          for (const lote of lotes(composicoes, 10)) {
            await tx.referenceComposition.createMany({
              data: lote.map(({ id, composicao }) => ({
                id,
                datasetId,
                code: composicao.code,
                description: composicao.description,
                searchKey: normalizeCatalogKey(composicao.description),
                unit: composicao.unit,
                group: composicao.group,
                unitCost: composicao.unitCost,
                situation: composicao.situation,
                metadata: composicao.metadata as Prisma.InputJsonValue,
              })),
            });
          }

          const linhas = composicoes.flatMap(({ id, composicao }) =>
            composicao.components.map((componente) => ({
              compositionId: id,
              position: componente.position,
              section: componente.section,
              kind: componente.kind,
              code: componente.code,
              description: componente.description,
              unit: componente.unit,
              coefficient: componente.coefficient,
              unitPrice: componente.unitPrice,
              totalCost: componente.totalCost,
              situation: componente.situation,
              metadata: componente.metadata as Prisma.InputJsonValue,
            })),
          );
          for (const lote of lotes(linhas, 13)) {
            await tx.referenceCompositionItem.createMany({ data: lote });
          }
        },
        { timeout: TEMPO_DA_IMPORTACAO_MS, maxWait: 10_000 },
      );
    } catch (error) {
      // Duas importações simultâneas da mesma referência: a unique recusa a
      // segunda, e a transação dela é desfeita inteira.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        JSON.stringify(error.meta ?? {}).includes('versionLabel')
      ) {
        throw new ConflictException('Esta base acabou de ser importada por outra pessoa.');
      }
      throw error;
    }

    // Um evento agregado, e não um por linha: são dezenas de milhares.
    await this.auditLogger.log({
      companyId,
      userId,
      action: 'CREATE',
      entityType: 'ReferenceDataset',
      entityId: datasetId,
      changes: {
        source: parsed.source,
        competence,
        uf,
        regime: parsed.regime,
        versionLabel,
        itemCount: parsed.items.length,
        compositionCount: parsed.compositions.length,
        componentCount,
        warningCount: parsed.warnings.length,
        fileHash,
      },
    });

    return this.findOne(datasetId);
  }

  async findAll(query: QueryReferenceDatasetDto) {
    const { page, limit, source, uf, regime, competence } = query;
    const where: Prisma.ReferenceDatasetWhereInput = { source, uf, regime, competence };
    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.referenceDataset.findMany({
        where,
        orderBy: [{ referenceDate: 'desc' }, { source: 'asc' }, { uf: 'asc' }, { regime: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referenceDataset.count({ where }),
    ]);
    return paginate(linhas.map(apresentarDataset), total, page, limit);
  }

  async findOne(id: string) {
    const dataset = await this.prisma.referenceDataset.findUnique({ where: { id } });
    if (!dataset) throw new NotFoundException('Base referencial não encontrada.');
    return apresentarDataset(dataset);
  }

  async searchItems(datasetId: string, query: QueryReferenceSearchDto) {
    await this.findOne(datasetId);
    const { page, limit } = query;
    const where: Prisma.ReferenceItemWhereInput = { datasetId, ...busca(query.search) };
    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.referenceItem.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.referenceItem.count({ where }),
    ]);
    return paginate(
      linhas.map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description,
        unit: item.unit,
        category: item.category,
        unitPrice: item.unitPrice?.toFixed(4) ?? null,
        metadata: item.metadata,
      })),
      total,
      page,
      limit,
    );
  }

  async searchCompositions(datasetId: string, query: QueryReferenceSearchDto) {
    await this.findOne(datasetId);
    const { page, limit } = query;
    const where: Prisma.ReferenceCompositionWhereInput = { datasetId, ...busca(query.search) };
    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.referenceComposition.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { components: true } } },
      }),
      this.prisma.referenceComposition.count({ where }),
    ]);
    return paginate(
      linhas.map((composicao) => ({
        id: composicao.id,
        code: composicao.code,
        description: composicao.description,
        unit: composicao.unit,
        group: composicao.group,
        unitCost: composicao.unitCost?.toFixed(4) ?? null,
        situation: composicao.situation,
        componentCount: composicao._count.components,
      })),
      total,
      page,
      limit,
    );
  }

  /// A composição ANALÍTICA: cada linha com coeficiente, unidade, preço e
  /// contribuição de custo, como a base publicou.
  async findComposition(id: string) {
    const composicao = await this.prisma.referenceComposition.findUnique({
      where: { id },
      include: { dataset: true, components: { orderBy: { position: 'asc' } } },
    });
    if (!composicao) throw new NotFoundException('Composição de referência não encontrada.');
    return {
      id: composicao.id,
      code: composicao.code,
      description: composicao.description,
      unit: composicao.unit,
      group: composicao.group,
      unitCost: composicao.unitCost?.toFixed(4) ?? null,
      situation: composicao.situation,
      metadata: composicao.metadata,
      dataset: apresentarDataset(composicao.dataset),
      components: composicao.components.map((linha) => ({
        id: linha.id,
        position: linha.position,
        section: linha.section,
        kind: linha.kind,
        code: linha.code,
        description: linha.description,
        unit: linha.unit,
        coefficient: linha.coefficient?.toFixed(7) ?? null,
        unitPrice: linha.unitPrice?.toFixed(4) ?? null,
        totalCost: linha.totalCost?.toFixed(4) ?? null,
        situation: linha.situation,
        metadata: linha.metadata,
      })),
    };
  }

  /// Lê os arquivos e confere o que o banco exigiria: código único por
  /// insumo e por composição dentro da base. Um parser que deixe passar
  /// repetição vira ERRO na prévia, e não uma violação de unique no meio da
  /// importação.
  private async parse(dto: ReferenceImportDto, files: UploadedReferenceFile[]): Promise<ParsedReferenceDataset> {
    let parsed: ParsedReferenceDataset;
    try {
      parsed = await this.parseSource(dto, files);
    } catch (error) {
      if (error instanceof XlsxInvalidoError) throw new BadRequestException(error.message);
      throw error;
    }
    for (const [lista, rotulo] of [
      [parsed.items, 'insumo'],
      [parsed.compositions, 'composição'],
    ] as const) {
      const vistos = new Set<string>();
      const repetidos = new Set<string>();
      for (const { code } of lista) (vistos.has(code) ? repetidos : vistos).add(code);
      if (repetidos.size > 0) {
        parsed.errors.push({
          code: 'CODIGO_DUPLICADO',
          message: `${repetidos.size} código(s) de ${rotulo} repetidos na base (ex.: ${[...repetidos].slice(0, 5).join(', ')}).`,
        });
      }
    }
    return parsed;
  }

  /// Escolhe o parser pela fonte. É o ÚNICO ponto que conhece as fontes.
  private async parseSource(dto: ReferenceImportDto, files: UploadedReferenceFile[]): Promise<ParsedReferenceDataset> {
    if (files.length === 0) throw new BadRequestException('Envie o arquivo da base.');

    if (dto.source === 'SINAPI') {
      if (files.length !== 1) {
        throw new BadRequestException('O SINAPI é importado a partir de UM arquivo: "SINAPI_Referência_AAAA_MM.xlsx".');
      }
      if (!dto.uf) throw new BadRequestException('Escolha a UF da referência SINAPI.');
      if (!dto.regime) throw new BadRequestException('Escolha o regime (sem desoneração, com desoneração ou sem encargos).');
      return parseSinapiReference(files[0]!.buffer, { uf: dto.uf, regime: dto.regime });
    }

    if (dto.source === 'SICRO') {
      if (dto.regime && dto.regime !== 'NAO_DESONERADO') {
        throw new BadRequestException('O SICRO publica composições só sem desoneração.');
      }
      return parseSicroReports(files.map((arquivo) => ({ name: arquivo.originalname, buffer: arquivo.buffer })));
    }

    throw new BadRequestException('Fonte não suportada.');
  }

  private async findDuplicate(parsed: ParsedReferenceDataset, versionLabel: string | undefined) {
    if (!parsed.competence || !parsed.uf) return null;
    return this.prisma.referenceDataset.findUnique({
      where: {
        source_competence_uf_regime_versionLabel: {
          source: parsed.source,
          competence: parsed.competence,
          uf: parsed.uf,
          regime: parsed.regime,
          versionLabel: (versionLabel ?? '').trim(),
        },
      },
      select: { id: true, importedAt: true },
    });
  }
}

/// SHA-256 dos arquivos, na ordem do nome — o mesmo conjunto dá o mesmo hash.
export function hashDosArquivos(files: UploadedReferenceFile[]): string {
  const hash = createHash('sha256');
  for (const arquivo of [...files].sort((a, b) => a.originalname.localeCompare(b.originalname))) {
    hash.update(arquivo.originalname);
    hash.update(createHash('sha256').update(arquivo.buffer).digest('hex'));
  }
  return hash.digest('hex');
}

export function lotes<T>(linhas: T[], colunas: number): T[][] {
  const tamanho = Math.max(1, Math.floor(PARAMETROS_POR_LOTE / colunas));
  const resultado: T[][] = [];
  for (let inicio = 0; inicio < linhas.length; inicio += tamanho) {
    resultado.push(linhas.slice(inicio, inicio + tamanho));
  }
  return resultado;
}

/// Código por prefixo (como publicado, em caixa alta) ou descrição em qualquer
/// trecho, sem acento. Escapado para `%` e `_` não virarem curinga.
function busca(search: string | undefined) {
  const termo = search?.trim();
  if (!termo) return {};
  return {
    OR: [
      { code: { startsWith: termo.toUpperCase() } },
      { searchKey: { contains: escapeLikePattern(normalizeCatalogKey(termo)) } },
    ],
  };
}

function apresentarDataset(dataset: Prisma.ReferenceDatasetGetPayload<object>) {
  return {
    id: dataset.id,
    source: dataset.source,
    competence: dataset.competence,
    referenceDate: dateToDateOnly(dataset.referenceDate),
    uf: dataset.uf,
    locality: dataset.locality,
    regime: dataset.regime,
    versionLabel: dataset.versionLabel,
    publishedAt: dataset.publishedAt ? dateToDateOnly(dataset.publishedAt) : null,
    fileNames: dataset.fileNames,
    itemCount: dataset.itemCount,
    compositionCount: dataset.compositionCount,
    metadata: dataset.metadata,
    importedAt: dataset.importedAt,
  };
}

function resumo(
  parsed: ParsedReferenceDataset,
  dto: ReferenceImportDto,
  files: UploadedReferenceFile[],
  fileHash: string,
  duplicate: { id: string; importedAt: Date } | null,
) {
  const corte = (lista: ImportIssue[]) => lista.slice(0, MAX_ISSUES_NA_RESPOSTA);
  return {
    source: parsed.source,
    competence: parsed.competence,
    referenceDate: parsed.competence ? competenceStartDate(parsed.competence) : null,
    uf: parsed.uf,
    locality: parsed.locality,
    regime: parsed.regime,
    versionLabel: (dto.versionLabel ?? '').trim(),
    publishedAt: parsed.publishedAt,
    itemCount: parsed.items.length,
    compositionCount: parsed.compositions.length,
    componentCount: parsed.compositions.reduce((total, c) => total + c.components.length, 0),
    itemsWithoutPrice: parsed.items.filter((item) => item.unitPrice === null).length,
    compositionsWithoutCost: parsed.compositions.filter((c) => c.unitCost === null).length,
    errors: corte(parsed.errors),
    errorCount: parsed.errors.length,
    warnings: corte(parsed.warnings),
    warningCount: parsed.warnings.length,
    fileNames: files.map((arquivo) => arquivo.originalname),
    fileHash,
    duplicate: duplicate ? { id: duplicate.id, importedAt: duplicate.importedAt } : null,
    availableUfs: (parsed.metadata.availableUfs as string[] | undefined) ?? null,
    canImport: parsed.errors.length === 0 && !duplicate && Boolean(parsed.competence && parsed.uf),
  };
}
