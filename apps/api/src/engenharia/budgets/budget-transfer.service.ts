import { createHash, randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../../common/audit-context';
import { loadCompanyLogo } from '../../common/pdf/company-logo';
import { renderDocumentPdf } from '../../common/pdf/pdf-renderer';
import { buildCompanyHeader, COMPANY_HEADER_SELECT } from '../../common/pdf/printable-document';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { ZERO } from '../../compras/discount';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.module';
import { latestReferencePriceRows } from '../catalog-item-prices/latest-prices';
import { dateToDateOnly } from '../catalog-item-prices/reference-date';
import { lotes } from '../reference/reference-datasets.service';
import { loadPricedComposition, type PricedReferenceComposition } from '../reference/reference-pricing';
import { lineTotalExact, moneyPair } from './budget-cost';
import {
  buildBudgetDocument,
  buildBudgetWorkbook,
  exportFileName,
} from './budget-export';
import {
  buildBudgetTemplate,
  readBudgetSheet,
  type BudgetSheetIssue,
  type BudgetSheetRow,
} from './budget-import-sheet';
import {
  catalogItemSnapshot,
  compositionSnapshot,
  referenceSnapshot,
  SnapshotProblem,
  type Snapshot,
} from './budget-snapshots';
import { BudgetsService } from './budgets.service';
import type { BudgetImportDto } from './dto/budget.dto';

type Tx = Prisma.TransactionClient;

interface ReferenceItemRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  unitPrice: Prisma.Decimal | null;
}

export interface BudgetImportSummary {
  groupCount: number;
  itemCount: number;
  byType: Record<'MANUAL' | 'INSUMO' | 'COMPOSICAO' | 'REFERENCIA', number>;
  directCost: string;
  directCostExact: string;
}

interface ImportRun {
  errors: BudgetSheetIssue[];
  summary: BudgetImportSummary;
}

/// Desfaz a transação levando o resultado junto. É assim que a PRÉVIA roda o
/// mesmo caminho da importação sem deixar nada gravado.
class DesfazerImportacao extends Error {
  constructor(readonly resultado: ImportRun) {
    super('importação desfeita');
  }
}

const VAZIO: BudgetImportSummary = {
  groupCount: 0,
  itemCount: 0,
  byType: { MANUAL: 0, INSUMO: 0, COMPOSICAO: 0, REFERENCIA: 0 },
  directCost: '0.00',
  directCostExact: '0.00000000',
};

/// Entrada e saída do orçamento por arquivo: modelo de importação, prévia,
/// importação e exportação XLSX/PDF.
///
/// ## Importação
///
/// Só num orçamento SEM EAP (rascunho ou fechado) — importar por cima de uma estrutura existente
/// obrigaria a decidir o que fazer com cada grupo e item que já estava lá, e a
/// planilha não tem como dizer. A planilha inteira entra numa transação, com o
/// orçamento travado `FOR UPDATE`; qualquer linha com erro desfaz tudo.
///
/// A PRÉVIA executa exatamente a mesma importação e DESFAZ a transação no fim:
/// o que ela mostra (erros, contagens, custo direto) é o que a confirmação
/// grava, sem uma segunda implementação que possa divergir. Ela roda fora do
/// contexto de auditoria — uma prévia não é alteração.
///
/// Os snapshots são os mesmos da inclusão manual (`budget-snapshots.ts`), com
/// as origens buscadas em lote: uma consulta por tipo, não uma por linha.
@Injectable()
export class BudgetTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly auditLogger: AuditLoggerService,
    private readonly storage: StorageService,
  ) {}

  template(): Promise<Buffer> {
    return buildBudgetTemplate();
  }

  async export(companyId: string, id: string, format: 'xlsx' | 'pdf') {
    const orcamento = await this.budgets.findOne(companyId, id);
    const agora = new Date();
    const fileName = `${exportFileName(orcamento)}.${format}`;

    if (format === 'xlsx') {
      return {
        buffer: await buildBudgetWorkbook(orcamento, agora),
        fileName,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // A empresa vem do TOKEN; o logo é lido aqui, fora do builder puro.
    const company = await this.prisma.company.findFirstOrThrow({
      where: { id: companyId },
      select: COMPANY_HEADER_SELECT,
    });
    const logo = await loadCompanyLogo(this.storage, company.logoUrl);
    const { buffer } = await renderDocumentPdf(
      buildBudgetDocument(orcamento, buildCompanyHeader(company, logo), agora),
    );
    return { buffer, fileName, contentType: 'application/pdf' };
  }

  async preview(companyId: string, budgetId: string, file: Buffer, dto: BudgetImportDto) {
    const fileHash = hash(file);
    const planilha = await readBudgetSheet(file);
    if (planilha.errors.length > 0) {
      return { fileHash, errors: planilha.errors, warnings: planilha.warnings, summary: VAZIO, canImport: false };
    }
    const resultado = await this.executar(companyId, budgetId, planilha.rows, dto.referenceDatasetId, false);
    return {
      fileHash,
      errors: resultado.errors,
      warnings: planilha.warnings,
      summary: resultado.summary,
      canImport: resultado.errors.length === 0,
    };
  }

  async import(companyId: string, userId: string, budgetId: string, file: Buffer, dto: BudgetImportDto) {
    const fileHash = hash(file);
    if (!dto.fileHash) throw new BadRequestException('Analise a planilha antes de importar.');
    if (dto.fileHash !== fileHash) {
      throw new BadRequestException('A planilha enviada não é a mesma que foi analisada. Faça a prévia de novo.');
    }

    const planilha = await readBudgetSheet(file);
    if (planilha.errors.length > 0) throw recusa(planilha.errors);

    const resultado = await this.executar(companyId, budgetId, planilha.rows, dto.referenceDatasetId, true);
    if (resultado.errors.length > 0) throw recusa(resultado.errors);

    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: budgetId,
      changes: {
        importedSheet: {
          fileHash,
          rows: planilha.rows.length,
          groups: resultado.summary.groupCount,
          items: resultado.summary.itemCount,
          directCost: resultado.summary.directCost,
          referenceDatasetId: dto.referenceDatasetId ?? null,
        },
      },
    });

    return this.budgets.findOne(companyId, budgetId);
  }

  private async executar(
    companyId: string,
    budgetId: string,
    rows: BudgetSheetRow[],
    referenceDatasetId: string | undefined,
    gravar: boolean,
  ): Promise<ImportRun> {
    try {
      return await auditContextStorage.exit(() =>
        this.prisma.$transaction(async (tx) => {
          const resultado = await this.aplicar(tx, companyId, budgetId, rows, referenceDatasetId);
          if (!gravar || resultado.errors.length > 0) throw new DesfazerImportacao(resultado);
          return resultado;
        }),
      );
    } catch (error) {
      if (error instanceof DesfazerImportacao) return error.resultado;
      throw error;
    }
  }

  private async aplicar(
    tx: Tx,
    companyId: string,
    budgetId: string,
    rows: BudgetSheetRow[],
    referenceDatasetId: string | undefined,
  ): Promise<ImportRun> {
    await this.budgets.lockEditable(tx, companyId, budgetId, 'UPDATE');
    const orcamento = await tx.budget.findFirstOrThrow({
      where: { id: budgetId },
      select: { referenceDate: true, _count: { select: { nodes: true } } },
    });
    if (orcamento._count.nodes > 0) {
      throw new ConflictException(
        'A importação por planilha é feita num orçamento sem EAP. Exclua os grupos existentes ou crie um orçamento novo.',
      );
    }

    const errors: BudgetSheetIssue[] = [];
    const codigos = (tipo: BudgetSheetRow['type']) =>
      [...new Set(rows.filter((linha) => linha.type === tipo).map((linha) => linha.originCode!.toUpperCase()))];

    const insumos = new Map(
      (
        await tx.catalogItem.findMany({
          where: { companyId, deletedAt: null, code: { in: codigos('INSUMO') } },
          select: { id: true, code: true, name: true, unit: true, type: true, active: true },
        })
      ).map((insumo) => [insumo.code, insumo]),
    );
    const composicoes = new Map(
      (
        await tx.composition.findMany({
          where: { companyId, deletedAt: null, code: { in: codigos('COMPOSICAO') } },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
              include: { catalogItem: { select: { code: true, name: true, type: true, unit: true } } },
            },
          },
        })
      ).map((composicao) => [composicao.code, composicao]),
    );
    const vigentes = await latestReferencePriceRows(
      tx,
      companyId,
      [
        ...new Set([
          ...[...insumos.values()].map((insumo) => insumo.id),
          ...[...composicoes.values()].flatMap((composicao) => composicao.items.map((linha) => linha.catalogItemId)),
        ]),
      ],
      dateToDateOnly(orcamento.referenceDate),
    );

    // Base referencial: códigos procurados como publicados e, para os só
    // numéricos, também com zeros à esquerda (o Excel apaga os do SICRO,
    // "0307731", quando a célula vira número).
    const codigosDeReferencia = codigos('REFERENCIA').flatMap((codigo) =>
      /^\d+$/.test(codigo) ? [codigo, codigo.padStart(7, '0')] : [codigo],
    );
    let dataset: Prisma.ReferenceDatasetGetPayload<object> | null = null;
    const refInsumos = new Map<string, ReferenceItemRow>();
    const refComposicoes = new Map<string, PricedReferenceComposition>();
    if (codigosDeReferencia.length > 0 && referenceDatasetId) {
      dataset = await tx.referenceDataset.findUnique({ where: { id: referenceDatasetId } });
      if (dataset) {
        for (const linha of await tx.referenceItemPrice.findMany({
          where: { datasetId: dataset.id, item: { code: { in: codigosDeReferencia } } },
          include: { item: true },
        })) {
          refInsumos.set(linha.item.code, {
            id: linha.item.id,
            code: linha.item.code,
            description: linha.item.description,
            unit: linha.item.unit,
            unitPrice: linha.unitPrice,
          });
        }
        const encontradas = await tx.referenceCompositionPrice.findMany({
          where: { datasetId: dataset.id, composition: { code: { in: codigosDeReferencia } } },
          select: { compositionId: true },
        });
        // Uma consulta de linhas por composição DISTINTA usada na planilha.
        for (const { compositionId } of encontradas) {
          const precificada = await loadPricedComposition(tx, dataset.id, compositionId);
          if (precificada) refComposicoes.set(precificada.composition.code, precificada);
        }
      }
    }

    const nodes: Prisma.BudgetNodeCreateManyInput[] = [];
    const items: Prisma.BudgetItemCreateManyInput[] = [];
    const components: Prisma.BudgetItemComponentCreateManyInput[] = [];
    const referenceComponents: Prisma.BudgetItemReferenceComponentCreateManyInput[] = [];
    const noPorCodigo = new Map<string, string>();
    const filhos = new Map<string, number>();
    const itensDoNo = new Map<string, number>();
    const summary: BudgetImportSummary = { ...VAZIO, byType: { ...VAZIO.byType } };
    let exato = ZERO;

    for (const linha of rows) {
      if (linha.type === 'GRUPO') {
        const id = randomUUID();
        const parentId = linha.parentCode ? noPorCodigo.get(linha.parentCode)! : null;
        const chave = parentId ?? '';
        const position = filhos.get(chave) ?? 0;
        filhos.set(chave, position + 1);
        noPorCodigo.set(linha.eapCode, id);
        nodes.push({ id, budgetId, parentId, name: linha.description!, position });
        summary.groupCount += 1;
        continue;
      }

      let snapshot: Snapshot;
      try {
        snapshot = this.snapshotDaLinha(linha, {
          insumos,
          composicoes,
          vigentes,
          dataset,
          referenceDatasetId,
          refInsumos,
          refComposicoes,
          dataBase: orcamento.referenceDate,
        });
      } catch (error) {
        if (error instanceof SnapshotProblem) {
          errors.push({ row: linha.row, message: `${linha.eapCode}: ${error.message}` });
          continue;
        }
        throw error;
      }

      const budgetNodeId = noPorCodigo.get(linha.parentCode!)!;
      const position = itensDoNo.get(budgetNodeId) ?? 0;
      itensDoNo.set(budgetNodeId, position + 1);
      const id = randomUUID();
      const quantity = new Prisma.Decimal(linha.quantity!);

      items.push({ id, budgetId, budgetNodeId, position, quantity, ...snapshot.item });
      components.push(...snapshot.components.map((componente) => ({ ...componente, budgetItemId: id })));
      referenceComponents.push(...snapshot.referenceComponents.map((componente) => ({ ...componente, budgetItemId: id })));

      exato = exato.plus(lineTotalExact(quantity, snapshot.item.unitCost));
      summary.itemCount += 1;
      summary.byType[linha.type] += 1;
    }

    const custo = moneyPair(exato);
    summary.directCost = custo.amount;
    summary.directCostExact = custo.exact;

    if (errors.length > 0) return { errors, summary };

    // Pré-ordem garantida pela planilha (o pai vem antes): lote nenhum grava
    // um filho sem o pai.
    for (const lote of lotes(nodes, 5)) await tx.budgetNode.createMany({ data: lote });
    for (const lote of lotes(items, 27)) await tx.budgetItem.createMany({ data: lote });
    for (const lote of lotes(components, 12)) await tx.budgetItemComponent.createMany({ data: lote });
    for (const lote of lotes(referenceComponents, 13)) {
      await tx.budgetItemReferenceComponent.createMany({ data: lote });
    }

    return { errors, summary };
  }

  private snapshotDaLinha(
    linha: BudgetSheetRow,
    fontes: {
      insumos: Map<string, Parameters<typeof catalogItemSnapshot>[0]>;
      composicoes: Map<string, Parameters<typeof compositionSnapshot>[0]>;
      vigentes: Parameters<typeof compositionSnapshot>[1];
      dataset: Prisma.ReferenceDatasetGetPayload<object> | null;
      referenceDatasetId: string | undefined;
      refInsumos: Map<string, ReferenceItemRow>;
      refComposicoes: Map<string, PricedReferenceComposition>;
      dataBase: Date;
    },
  ): Snapshot {
    const codigo = linha.originCode?.toUpperCase() ?? '';

    switch (linha.type) {
      case 'MANUAL':
        return {
          item: {
            source: 'MANUAL',
            sourceCode: null,
            description: linha.description!,
            unit: linha.unit!,
            unitCost: new Prisma.Decimal(linha.unitCost!),
          },
          components: [],
          referenceComponents: [],
        };

      case 'INSUMO': {
        const insumo = fontes.insumos.get(codigo);
        if (!insumo) throw new SnapshotProblem(`insumo ${linha.originCode} não encontrado.`);
        const vigente = fontes.vigentes.get(insumo.id);
        const naUnidade = vigente && vigente.unit === insumo.unit ? vigente : undefined;
        if (linha.unitCost === null && !naUnidade) {
          throw new SnapshotProblem(
            `o insumo ${insumo.code} não tem preço de referência até a data-base; informe o custo unitário.`,
          );
        }
        const custo = linha.unitCost === null ? naUnidade!.unitPrice : new Prisma.Decimal(linha.unitCost);
        return catalogItemSnapshot(insumo, custo, naUnidade);
      }

      case 'COMPOSICAO': {
        const composicao = fontes.composicoes.get(codigo);
        if (!composicao) throw new SnapshotProblem(`composição ${linha.originCode} não encontrada.`);
        return compositionSnapshot(composicao, fontes.vigentes);
      }

      case 'REFERENCIA': {
        if (!fontes.referenceDatasetId) {
          throw new SnapshotProblem('escolha, na importação, a base referencial das linhas REFERENCIA.');
        }
        if (!fontes.dataset) throw new SnapshotProblem('base referencial escolhida não encontrada.');
        const candidatos = /^\d+$/.test(codigo) ? [codigo, codigo.padStart(7, '0')] : [codigo];
        const composicao = candidatos.map((c) => fontes.refComposicoes.get(c)).find(Boolean);
        const insumo = candidatos.map((c) => fontes.refInsumos.get(c)).find(Boolean);
        if (composicao && insumo) {
          throw new SnapshotProblem(
            `o código ${linha.originCode} existe como insumo e como composição na base; inclua este item pelo editor.`,
          );
        }
        if (composicao) {
          return referenceSnapshot(
            {
              kind: 'COMPOSITION',
              id: composicao.composition.id,
              code: composicao.composition.code,
              description: composicao.composition.description,
              unit: composicao.composition.unit,
              price: composicao.unitCost,
              components: composicao.components,
            },
            fontes.dataset,
            fontes.dataBase,
          );
        }
        if (insumo) {
          return referenceSnapshot(
            {
              kind: 'ITEM',
              id: insumo.id,
              code: insumo.code,
              description: insumo.description,
              unit: insumo.unit,
              price: insumo.unitPrice,
              components: [],
            },
            fontes.dataset,
            fontes.dataBase,
          );
        }
        throw new SnapshotProblem(
          `código ${linha.originCode} não encontrado na base ${fontes.dataset.source} ${fontes.dataset.uf} ${fontes.dataset.competence}.`,
        );
      }

      default:
        throw new SnapshotProblem('tipo de linha inválido.');
    }
  }
}

function hash(file: Buffer): string {
  return createHash('sha256').update(file).digest('hex');
}

function recusa(errors: BudgetSheetIssue[]): BadRequestException {
  const lista = errors
    .slice(0, 10)
    .map((erro) => (erro.row ? `Linha ${erro.row}: ${erro.message}` : erro.message))
    .join(' ');
  return new BadRequestException(
    `A planilha tem ${errors.length} erro(s) e nada foi importado. ${lista}`,
  );
}
