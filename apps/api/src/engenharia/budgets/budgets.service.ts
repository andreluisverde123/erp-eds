import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../../common/audit-context';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate } from '../../common/types/paginated-result.type';
import { isCanonicalUnit } from '../../common/units/measurement-units';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { escapeLikePattern } from '../../compras/purchase-requests/search-key';
import { PrismaService } from '../../prisma/prisma.service';
import {
  latestReferencePriceRows,
  latestReferencePrices,
} from '../catalog-item-prices/latest-prices';
import {
  dateOnlyToDate,
  dateToDateOnly,
  isDateOnly,
} from '../catalog-item-prices/reference-date';
import { catalogSearchWhere } from '../catalog-items/catalog-items.service';
import { normalizeCatalogKey } from '../catalog-items/catalog-key';
import {
  COEFFICIENT_SCALE,
  COST_SCALE,
  itemCost,
  PRICE_SCALE,
  toDecimal,
} from '../compositions/composition-cost';
import { lotes } from '../reference/reference-datasets.service';
import { BDI_SCALE, budgetPrice } from './budget-bdi';
import { closingProblems } from './budget-closing';
import {
  lineTotalExact,
  moneyPair,
  QUANTITY_SCALE,
  quantityProblem,
  sumExact,
  UNIT_COST_SCALE,
  unitCostProblem,
} from './budget-cost';
import { buildItemCodes } from './budget-item-codes';
import { planRevision } from './budget-revision';
import {
  catalogItemSnapshot,
  compositionSnapshot,
  referenceSnapshot,
  SnapshotProblem,
  type Snapshot,
} from './budget-snapshots';
import { buildBudgetTree, siblingOrder, subtreeIds } from './budget-tree';
import { priceCompositionAt } from './composition-pricing';
import {
  CreateBudgetDto,
  CreateBudgetItemDto,
  CreateBudgetNodeDto,
  MoveBudgetNodeDto,
  QueryBudgetDto,
  QueryReferenceOptionsDto,
  UpdateBudgetDto,
  UpdateBudgetItemDto,
  UpdateBudgetNodeDto,
} from './dto/budget.dto';

const PREFIXO = 'ORC';

const NAO_ENCONTRADO = 'Orçamento não encontrado.';
export const FECHADO = 'Este orçamento já está fechado.';
const SO_RASCUNHO_EXCLUI =
  'Só rascunho pode ser excluído. Orçamento fechado fica como histórico — para substituí-lo, crie uma nova revisão.';
const FECHADO_SEM_ITENS =
  'Orçamento fechado não pode ficar sem itens. Inclua o item novo antes de remover o último.';
const CODIGO_COLIDIU =
  'Não foi possível reservar o próximo código de orçamento. Tente salvar de novo.';
const OBRA_NAO_ENCONTRADA = 'Obra não encontrada.';
const DATA_INVALIDA = 'Data-base inválida. Use o formato AAAA-MM-DD.';
const NO_NAO_ENCONTRADO = 'Grupo da EAP não encontrado neste orçamento.';
const PAI_NAO_ENCONTRADO = 'Grupo pai não encontrado neste orçamento.';
const ITEM_NAO_ENCONTRADO = 'Item não encontrado neste orçamento.';
const CUSTO_DE_COMPOSICAO =
  'O custo de um item de composição é o da composição no momento da inclusão, congelado. Para usar outro custo, remova o item e inclua de novo.';
const CUSTO_DE_REFERENCIA =
  'O custo de um item de base referencial é o publicado pela base, congelado. Para usar outro custo, inclua um item manual.';
const DADOS_DA_ORIGEM =
  'Descrição e unidade de item de composição, de insumo ou de base referencial são copiadas da origem e não se editam.';
const SO_FECHADO_REVISA = 'Só um orçamento fechado pode ser revisado.';
const SO_FECHADO_OFICIAL = 'Só um orçamento fechado pode ser o orçamento oficial da obra.';

type Tx = Prisma.TransactionClient;

const DETALHE = {
  constructionSite: { select: { id: true, code: true, name: true, currentBudgetId: true } },
  createdBy: { select: { name: true } },
  closedBy: { select: { name: true } },
  revisedFrom: { select: { id: true, version: true } },
  nodes: true,
  items: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      components: { orderBy: { position: 'asc' } },
      referenceComponents: { orderBy: { position: 'asc' } },
    },
  },
} satisfies Prisma.BudgetInclude;

type BudgetDetail = Prisma.BudgetGetPayload<{ include: typeof DETALHE }>;

/// Orçamento da obra: documento com EAP própria e itens congelados.
///
/// ## Snapshot
///
/// Ao entrar no orçamento, a linha COPIA descrição, unidade e custo unitário —
/// e, se vier de composição própria ou de composição de base referencial, as
/// linhas dela (`budget-snapshots.ts`). Nenhuma leitura deste service consulta
/// composição, insumo, preço ou base referencial para calcular: os ids de
/// origem são só rastreio. Mudar a composição, o insumo, o histórico de preços
/// ou importar outra competência depois não altera orçamento nenhum.
///
/// ## Data-base
///
/// Composição própria é precificada NA DATA-BASE: cada linha usa o preço de
/// referência vigente nela, ou o preço da própria composição
/// (`composition-pricing.ts`). Base referencial só entra se a competência for
/// anterior ou igual à data-base.
///
/// ## Rascunho e fechado
///
/// Fechar marca o orçamento como documento concluído — é o que permite
/// defini-lo como oficial e revisá-lo —, mas NÃO o congela: a EDS precisa
/// ajustar orçamento fechado sem abrir nova versão. Toda alteração continua
/// registrada no histórico (auditoria). O que o fechado não aceita é ser
/// excluído, fechado de novo ou ficar sem itens. Quem quiser preservar a
/// versão como está cria uma revisão antes de mexer.
///
/// Toda escrita acontece numa transação que começa TRAVANDO a linha do
/// orçamento:
///
/// - escrita de EAP e de item: `FOR SHARE` — várias podem correr juntas;
/// - cabeçalho, BDI, exclusão, importação e fechamento: `FOR UPDATE`.
///
/// Os dois modos se excluem: um fechamento (ou uma revisão, que copia a
/// versão) espera as escritas em andamento terminarem, e nunca lê um
/// orçamento pela metade.
///
/// ## Versões
///
/// Um orçamento fechado não muda. A revisão cria a versão seguinte (mesmo
/// código, `version + 1`) como rascunho, copiando tudo. Só a versão mais recente
/// pode ser revisada, e a versão de origem fica travada durante a cópia — duas
/// revisões simultâneas não criam duas v2.
///
/// ## Isolamento
///
/// Obra, composição, insumo e preço usados são conferidos contra a empresa da
/// sessão. EAP e item são procurados DENTRO do orçamento já conferido, e o
/// banco recusa nó ou item apontando para outro orçamento (FK composta). As
/// bases referenciais são globais e somente leitura.
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Orçamento
  // ---------------------------------------------------------------------------

  async findAll(companyId: string, query: QueryBudgetDto) {
    const { page, limit, search, status, constructionSiteId } = query;
    const where: Prisma.BudgetWhereInput = {
      companyId,
      deletedAt: null,
      status,
      constructionSiteId,
      ...buscaPor(search),
    };

    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.budget.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          constructionSite: { select: { id: true, code: true, name: true, currentBudgetId: true } },
          items: { select: { quantity: true, unitCost: true } },
        },
      }),
      this.prisma.budget.count({ where }),
    ]);

    const data = linhas.map((orcamento) => {
      const exato = sumExact(orcamento.items.map((item) => lineTotalExact(item.quantity, item.unitCost)));
      const totais = moneyPair(exato);
      const preco = budgetPrice(exato, orcamento.bdiPercent ?? 0);
      const { currentBudgetId, ...obra } = orcamento.constructionSite;
      return {
        id: orcamento.id,
        code: orcamento.code,
        version: orcamento.version,
        name: orcamento.name,
        description: orcamento.description,
        referenceDate: dateToDateOnly(orcamento.referenceDate),
        status: orcamento.status,
        closedAt: orcamento.closedAt,
        createdAt: orcamento.createdAt,
        updatedAt: orcamento.updatedAt,
        constructionSite: obra,
        isOfficial: currentBudgetId === orcamento.id,
        itemCount: orcamento.items.length,
        totalCost: totais.amount,
        totalCostExact: totais.exact,
        ...preco,
      };
    });

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const orcamento = await this.prisma.budget.findFirst({
      where: { id, companyId, deletedAt: null },
      include: DETALHE,
    });
    // 404 e não 403: quem não é do inquilino não fica sabendo que existe.
    if (!orcamento) throw new NotFoundException(NAO_ENCONTRADO);
    return detalhar(orcamento);
  }

  async create(companyId: string, userId: string, dto: CreateBudgetDto) {
    if (!isDateOnly(dto.referenceDate)) throw new BadRequestException(DATA_INVALIDA);
    await this.assertConstructionSite(companyId, dto.constructionSiteId);

    // Conta só as versões 1: a revisão do ORC-0001 continua sendo ORC-0001, e
    // não consome número.
    const code = await nextSequentialCode(
      () => this.prisma.budget.count({ where: { companyId, version: 1 } }),
      PREFIXO,
    );

    try {
      const criado = await this.prisma.budget.create({
        data: {
          companyId,
          constructionSiteId: dto.constructionSiteId,
          code,
          version: 1,
          name: dto.name.trim(),
          searchKey: normalizeCatalogKey(dto.name),
          description: dto.description?.trim() || null,
          referenceDate: dateOnlyToDate(dto.referenceDate),
          status: 'DRAFT',
          createdById: userId,
        },
      });
      return this.findOne(companyId, criado.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException(CODIGO_COLIDIU);
      throw error;
    }
  }

  /// Cabeçalho e BDI de um rascunho.
  ///
  /// Mudar a data-base NÃO reprecifica os itens já incluídos: eles guardam o
  /// custo que alguém escolheu. Só as próximas inclusões mudam.
  ///
  /// A mudança de BDI é auditada explicitamente: a extensão de auditoria lê o
  /// "depois" fora da transação e não enxergaria a alteração.
  async update(companyId: string, id: string, dto: UpdateBudgetDto) {
    if (dto.referenceDate !== undefined && !isDateOnly(dto.referenceDate)) {
      throw new BadRequestException(DATA_INVALIDA);
    }
    if (dto.constructionSiteId !== undefined) {
      await this.assertConstructionSite(companyId, dto.constructionSiteId);
    }
    const bdiPercent = dto.bdiPercent === undefined ? undefined : toDecimal(dto.bdiPercent)!;
    const bdiNote = dto.bdiNote === undefined ? undefined : dto.bdiNote.trim() || null;

    const mudancas = await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, id, 'UPDATE');

      const alteracoes: Record<string, { from: unknown; to: unknown }> = {};
      if (bdiPercent !== undefined || bdiNote !== undefined) {
        const antes = await tx.budget.findFirstOrThrow({
          where: { id },
          select: { bdiPercent: true, bdiNote: true },
        });
        if (bdiPercent !== undefined && !new Prisma.Decimal(antes.bdiPercent ?? 0).equals(bdiPercent)) {
          alteracoes.bdiPercent = {
            from: new Prisma.Decimal(antes.bdiPercent ?? 0).toFixed(BDI_SCALE),
            to: bdiPercent.toFixed(BDI_SCALE),
          };
        }
        if (bdiNote !== undefined && (antes.bdiNote ?? null) !== bdiNote) {
          alteracoes.bdiNote = { from: antes.bdiNote ?? null, to: bdiNote };
        }
      }

      await tx.budget.update({
        where: { id },
        data: {
          constructionSiteId: dto.constructionSiteId,
          name: dto.name?.trim(),
          searchKey: dto.name === undefined ? undefined : normalizeCatalogKey(dto.name),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          referenceDate:
            dto.referenceDate === undefined ? undefined : dateOnlyToDate(dto.referenceDate),
          bdiPercent,
          bdiNote,
        },
      });
      return alteracoes;
    });

    if (Object.keys(mudancas).length > 0) {
      await this.auditLogger.log({
        companyId,
        userId: auditContextStorage.getStore()?.userId ?? null,
        action: 'UPDATE',
        entityType: 'Budget',
        entityId: id,
        changes: mudancas as Prisma.InputJsonValue,
      });
    }

    return this.findOne(companyId, id);
  }

  /// Exclusão LÓGICA, e só de rascunho. Orçamento fechado é histórico.
  async remove(companyId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const orcamento = await this.lockEditable(tx, companyId, id, 'UPDATE');
      if (orcamento.status !== 'DRAFT') throw new ConflictException(SO_RASCUNHO_EXCLUI);
      await tx.budget.update({
        where: { id },
        data: { deletedAt: new Date(), code: mangleDeletedCode(orcamento.code, orcamento.id) },
      });
    });
  }

  /// FECHA o orçamento: rascunho → CLOSED, numa transação só.
  ///
  /// Trava a linha com `FOR UPDATE` (espera as escritas em andamento), confere
  /// a integridade COM OS DADOS DENTRO DA TRAVA — incluindo o BDI — e só então
  /// muda o status. O `updateMany` condicionado a `DRAFT` é a segunda barreira.
  async close(companyId: string, id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const orcamento = await this.lockEditable(tx, companyId, id, 'UPDATE');
      if (orcamento.status !== 'DRAFT') throw new ConflictException(FECHADO);


      const { bdiPercent } = await tx.budget.findFirstOrThrow({
        where: { id },
        select: { bdiPercent: true },
      });
      const nodes = await tx.budgetNode.findMany({ where: { budgetId: id } });
      const items = await tx.budgetItem.findMany({
        where: { budgetId: id },
        include: { _count: { select: { components: true, referenceComponents: true } } },
      });

      const problemas = closingProblems(
        nodes,
        items.map((item) => ({
          id: item.id,
          budgetNodeId: item.budgetNodeId,
          description: item.description,
          source: item.source,
          quantity: item.quantity,
          unitCost: item.unitCost,
          componentCount: item._count.components,
          referenceCode: item.referenceCode,
          referenceKind: item.referenceKind,
          referenceComponentCount: item._count.referenceComponents,
        })),
        bdiPercent,
      );
      if (problemas.length > 0) {
        throw new BadRequestException(`Não é possível fechar o orçamento. ${problemas.join(' ')}`);
      }

      const fechado = await tx.budget.updateMany({
        where: { id, companyId, status: 'DRAFT', deletedAt: null },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
      });
      if (fechado.count !== 1) throw new ConflictException(FECHADO);
    });

    // Fora da transação: a auditoria não pode desfazer um fechamento. E
    // explícita, porque o `updateMany` não passa pela extensão de auditoria.
    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: id,
      changes: { status: { from: 'DRAFT', to: 'CLOSED' } },
    });

    return this.findOne(companyId, id);
  }

  // ---------------------------------------------------------------------------
  // Versões e orçamento oficial
  // ---------------------------------------------------------------------------

  /// NOVA VERSÃO a partir de um orçamento fechado: v(n) CLOSED → v(n+1) DRAFT.
  ///
  /// Numa transação: trava a versão de origem (`FOR UPDATE`), confere que ela
  /// está fechada e que é a mais recente do código, e copia informações, BDI,
  /// data-base, EAP, itens, snapshots e linhas copiadas (`budget-revision.ts`).
  ///
  /// Duas revisões simultâneas da mesma versão: a segunda espera a trava, lê
  /// que já existe a versão seguinte e é recusada. A unique
  /// (empresa, código, versão) é a segunda barreira.
  ///
  /// A origem não muda, e o orçamento oficial da obra também não: trocar o
  /// oficial é ação explícita.
  async revise(companyId: string, id: string, userId: string) {
    const novoId = randomUUID();

    const resumo = await this.prisma
      .$transaction(async (tx) => {
        const [origem] = await tx.$queryRaw<{ id: string; code: string; status: string; version: number }[]>`
          SELECT id, code, status::text AS status, version FROM "Budget"
           WHERE id = ${id}::uuid AND "companyId" = ${companyId}::uuid AND "deletedAt" IS NULL
           FOR UPDATE`;
        if (!origem) throw new NotFoundException(NAO_ENCONTRADO);
        if (origem.status !== 'CLOSED') throw new BadRequestException(SO_FECHADO_REVISA);

        const ultima = await tx.budget.findFirst({
          where: { companyId, code: origem.code, deletedAt: null },
          orderBy: { version: 'desc' },
          select: { id: true, version: true, status: true },
        });
        if (ultima && ultima.id !== origem.id) {
          throw new ConflictException(
            `Já existe a versão v${ultima.version}${ultima.status === 'DRAFT' ? ' em rascunho' : ''} deste orçamento. Revise a versão mais recente.`,
          );
        }

        const fonte = await tx.budget.findUniqueOrThrow({
          where: { id },
          include: {
            nodes: true,
            items: { include: { components: true, referenceComponents: true } },
          },
        });

        const plano = planRevision({ nodes: fonte.nodes, items: fonte.items }, novoId, randomUUID);

        await tx.budget.create({
          data: {
            id: novoId,
            companyId,
            constructionSiteId: fonte.constructionSiteId,
            code: fonte.code,
            version: origem.version + 1,
            name: fonte.name,
            searchKey: fonte.searchKey,
            description: fonte.description,
            referenceDate: fonte.referenceDate,
            status: 'DRAFT',
            createdById: userId,
            bdiPercent: fonte.bdiPercent,
            bdiNote: fonte.bdiNote,
            revisedFromId: fonte.id,
          },
        });
        for (const lote of lotes(plano.nodes, 5)) await tx.budgetNode.createMany({ data: lote });
        for (const lote of lotes(plano.items, 27)) await tx.budgetItem.createMany({ data: lote });
        for (const lote of lotes(plano.components, 12)) await tx.budgetItemComponent.createMany({ data: lote });
        for (const lote of lotes(plano.referenceComponents, 13)) {
          await tx.budgetItemReferenceComponent.createMany({ data: lote });
        }

        return {
          fromVersion: origem.version,
          version: origem.version + 1,
          nodes: plano.nodes.length,
          items: plano.items.length,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException('Outra pessoa acabou de criar a nova versão deste orçamento.');
        }
        throw error;
      });

    await this.auditLogger.log({
      companyId,
      userId,
      action: 'CREATE',
      entityType: 'Budget',
      entityId: novoId,
      changes: { revisedFromId: id, ...resumo },
    });

    return this.findOne(companyId, novoId);
  }

  /// O histórico de versões do mesmo código: "v1 — Fechado", "v2 — Rascunho".
  async versions(companyId: string, id: string) {
    const orcamento = await this.prisma.budget.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { code: true },
    });
    if (!orcamento) throw new NotFoundException(NAO_ENCONTRADO);

    const versoes = await this.prisma.budget.findMany({
      where: { companyId, code: orcamento.code, deletedAt: null },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        status: true,
        closedAt: true,
        createdAt: true,
        revisedFromId: true,
        constructionSite: { select: { currentBudgetId: true } },
      },
    });
    return versoes.map(({ constructionSite, ...versao }) => ({
      ...versao,
      isOfficial: constructionSite.currentBudgetId === versao.id,
    }));
  }

  /// Define ESTE orçamento como o oficial da obra.
  ///
  /// Só fechado, só da própria obra (FK composta no banco) e só da empresa da
  /// sessão. Trava o orçamento (`FOR SHARE`) e a obra (`FOR UPDATE`): duas
  /// trocas simultâneas se enfileiram, e a última vence de forma consistente.
  async setOfficial(companyId: string, id: string, userId: string) {
    const troca = await this.prisma.$transaction(async (tx) => {
      const [orcamento] = await tx.$queryRaw<{ id: string; status: string; constructionSiteId: string }[]>`
        SELECT id, status::text AS status, "constructionSiteId" FROM "Budget"
         WHERE id = ${id}::uuid AND "companyId" = ${companyId}::uuid AND "deletedAt" IS NULL
         FOR SHARE`;
      if (!orcamento) throw new NotFoundException(NAO_ENCONTRADO);
      if (orcamento.status !== 'CLOSED') throw new BadRequestException(SO_FECHADO_OFICIAL);

      const [obra] = await tx.$queryRaw<{ id: string; currentBudgetId: string | null }[]>`
        SELECT id, "currentBudgetId" FROM "ConstructionSite"
         WHERE id = ${orcamento.constructionSiteId}::uuid AND "companyId" = ${companyId}::uuid AND "deletedAt" IS NULL
         FOR UPDATE`;
      if (!obra) throw new BadRequestException(OBRA_NAO_ENCONTRADA);
      if (obra.currentBudgetId === id) return null;

      await tx.constructionSite.update({ where: { id: obra.id }, data: { currentBudgetId: id } });
      return { constructionSiteId: obra.id, from: obra.currentBudgetId };
    });

    if (troca) {
      await this.auditLogger.log({
        companyId,
        userId,
        action: 'UPDATE',
        entityType: 'Budget',
        entityId: id,
        changes: {
          officialForSite: { from: troca.from, to: id },
          constructionSiteId: troca.constructionSiteId,
        },
      });
    }

    return this.findOne(companyId, id);
  }

  // ---------------------------------------------------------------------------
  // Opções para o editor (exigem `orcamentos.manage`)
  // ---------------------------------------------------------------------------

  async constructionSiteOptions(companyId: string, search?: string) {
    const termo = search?.trim();
    return this.prisma.constructionSite.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { code: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  /// Composições ATIVAS, com o custo unitário NA DATA-BASE do orçamento — que é
  /// o que vai ser congelado se a composição for incluída agora — e se esse
  /// custo veio do histórico de preços, da composição ou dos dois.
  async compositionOptions(companyId: string, budgetId: string, search?: string) {
    const orcamento = await this.assertBudget(companyId, budgetId);
    const termo = search?.trim();
    if (!termo) return [];

    const composicoes = await this.prisma.composition.findMany({
      where: {
        companyId,
        deletedAt: null,
        active: true,
        OR: [
          { searchKey: { contains: escapeLikePattern(normalizeCatalogKey(termo)) } },
          { code: { contains: termo.toUpperCase(), mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        items: {
          select: { catalogItemId: true, coefficient: true, unitPrice: true, catalogItem: { select: { unit: true } } },
        },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    // UMA consulta de preços para todas as composições listadas.
    const vigentes = await latestReferencePriceRows(
      this.prisma,
      companyId,
      [...new Set(composicoes.flatMap((composicao) => composicao.items.map((linha) => linha.catalogItemId)))],
      dateToDateOnly(orcamento.referenceDate),
    );

    return composicoes.map(({ items, ...composicao }) => {
      const precificada = priceCompositionAt(
        items.map((linha) => ({ ...linha, unit: linha.catalogItem?.unit ?? '' })),
        vigentes,
      );
      return {
        ...composicao,
        itemCount: items.length,
        unitCost: precificada.unitCost.toFixed(COST_SCALE),
        pricing: items.length === 0 ? null : precificada.pricing,
      };
    });
  }

  /// Insumos ATIVOS, com o preço de referência vigente NA DATA-BASE DO
  /// ORÇAMENTO como sugestão — nunca um preço de data posterior.
  async catalogOptions(companyId: string, budgetId: string, search?: string) {
    const orcamento = await this.assertBudget(companyId, budgetId);
    const termo = search?.trim();
    if (!termo) return [];

    const insumos = await this.prisma.catalogItem.findMany({
      where: { companyId, deletedAt: null, active: true, ...catalogSearchWhere(termo) },
      select: { id: true, code: true, name: true, unit: true, type: true },
      orderBy: { name: 'asc' },
      take: 20,
    });

    const vigentes = await latestReferencePrices(
      this.prisma,
      companyId,
      insumos.map((insumo) => insumo.id),
      dateToDateOnly(orcamento.referenceDate),
    );

    return insumos.map((insumo) => {
      const referencia = vigentes.get(insumo.id);
      return {
        ...insumo,
        referencePrice: referencia && referencia.unit === insumo.unit ? referencia : null,
      };
    });
  }

  /// Bases referenciais que PODEM entrar neste orçamento: competência anterior
  /// ou igual à data-base.
  async referenceDatasetOptions(companyId: string, budgetId: string) {
    const orcamento = await this.assertBudget(companyId, budgetId);
    const datasets = await this.prisma.referenceDataset.findMany({
      where: { referenceDate: { lte: orcamento.referenceDate } },
      orderBy: [{ referenceDate: 'desc' }, { source: 'asc' }, { uf: 'asc' }, { regime: 'asc' }],
      select: {
        id: true,
        source: true,
        competence: true,
        uf: true,
        locality: true,
        regime: true,
        versionLabel: true,
        itemCount: true,
        compositionCount: true,
      },
      take: 200,
    });
    return datasets;
  }

  /// Busca de insumo ou composição DENTRO de uma base, só com preço/custo.
  async referenceOptions(companyId: string, budgetId: string, query: QueryReferenceOptionsDto) {
    const orcamento = await this.assertBudget(companyId, budgetId);
    const dataset = await this.prisma.referenceDataset.findUnique({
      where: { id: query.datasetId },
      select: { referenceDate: true },
    });
    if (!dataset) throw new BadRequestException('Base referencial não encontrada.');
    if (dataset.referenceDate.getTime() > orcamento.referenceDate.getTime()) {
      throw new BadRequestException('Esta base é posterior à data-base do orçamento.');
    }
    const termo = query.search?.trim();
    if (!termo) return [];

    const filtro = {
      datasetId: query.datasetId,
      OR: [
        { code: { startsWith: termo.toUpperCase() } },
        { searchKey: { contains: escapeLikePattern(normalizeCatalogKey(termo)) } },
      ],
    };

    if (query.kind === 'ITEM') {
      const itens = await this.prisma.referenceItem.findMany({
        where: { ...filtro, unitPrice: { not: null } },
        orderBy: { code: 'asc' },
        take: 20,
        select: { id: true, code: true, description: true, unit: true, category: true, unitPrice: true },
      });
      return itens.map(({ unitPrice, ...item }) => ({
        ...item,
        kind: 'ITEM' as const,
        unitCost: unitPrice!.toFixed(UNIT_COST_SCALE),
        componentCount: 0,
      }));
    }

    const composicoes = await this.prisma.referenceComposition.findMany({
      where: { ...filtro, unitCost: { not: null } },
      orderBy: { code: 'asc' },
      take: 20,
      select: {
        id: true,
        code: true,
        description: true,
        unit: true,
        group: true,
        unitCost: true,
        _count: { select: { components: true } },
      },
    });
    return composicoes.map(({ unitCost, _count, group, ...composicao }) => ({
      ...composicao,
      category: group,
      kind: 'COMPOSITION' as const,
      unitCost: unitCost!.toFixed(UNIT_COST_SCALE),
      componentCount: _count.components,
    }));
  }

  // ---------------------------------------------------------------------------
  // EAP
  // ---------------------------------------------------------------------------

  async addNode(companyId: string, budgetId: string, dto: CreateBudgetNodeDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, budgetId, 'SHARE');

      const parentId = dto.parentId ?? null;
      if (parentId) {
        // Procurado DENTRO deste orçamento: o pai de outro orçamento não
        // existe aqui. O banco recusaria também (FK composta).
        const pai = await tx.budgetNode.findFirst({
          where: { id: parentId, budgetId },
          select: { id: true },
        });
        if (!pai) throw new BadRequestException(PAI_NAO_ENCONTRADO);
      }

      const ultimo = await tx.budgetNode.aggregate({
        where: { budgetId, parentId },
        _max: { position: true },
      });

      await tx.budgetNode.create({
        data: {
          budgetId,
          parentId,
          name: dto.name.trim(),
          position: (ultimo._max.position ?? -1) + 1,
        },
      });
    });

    return this.findOne(companyId, budgetId);
  }

  /// Só o nome. O pai não se troca: é o que torna ciclo impossível.
  async updateNode(companyId: string, budgetId: string, nodeId: string, dto: UpdateBudgetNodeDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, budgetId, 'SHARE');
      await this.assertNode(tx, budgetId, nodeId);
      await tx.budgetNode.update({ where: { id: nodeId }, data: { name: dto.name.trim() } });
    });
    return this.findOne(companyId, budgetId);
  }

  /// Sobe ou desce o grupo entre os irmãos. As posições dos irmãos são
  /// regravadas em sequência (0, 1, 2…), o que também desfaz empates deixados
  /// por inclusões simultâneas.
  async moveNode(companyId: string, budgetId: string, nodeId: string, dto: MoveBudgetNodeDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, budgetId, 'SHARE');
      const node = await this.assertNode(tx, budgetId, nodeId);

      const irmaos = (
        await tx.budgetNode.findMany({ where: { budgetId, parentId: node.parentId } })
      ).sort(siblingOrder);
      const de = irmaos.findIndex((irmao) => irmao.id === nodeId);
      const para = dto.direction === 'UP' ? de - 1 : de + 1;
      if (para < 0 || para >= irmaos.length) return;

      [irmaos[de], irmaos[para]] = [irmaos[para]!, irmaos[de]!];
      for (const [posicao, irmao] of irmaos.entries()) {
        if (irmao.position !== posicao) {
          await tx.budgetNode.update({ where: { id: irmao.id }, data: { position: posicao } });
        }
      }
    });
    return this.findOne(companyId, budgetId);
  }

  /// Remove o grupo, os subgrupos e os itens deles — enquanto rascunho.
  ///
  /// Dois `deleteMany` na mesma transação: itens da subárvore, depois os nós.
  /// A FK do pai é `NO ACTION`, conferida no fim do comando, então a
  /// subárvore inteira sai num DELETE só.
  async removeNode(companyId: string, budgetId: string, nodeId: string) {
    const removidos = await this.prisma.$transaction(async (tx) => {
      const orcamento = await this.lockEditable(tx, companyId, budgetId, 'SHARE');
      const node = await this.assertNode(tx, budgetId, nodeId);

      const nodes = await tx.budgetNode.findMany({
        where: { budgetId },
        select: { id: true, parentId: true },
      });
      const ids = subtreeIds(nodes, nodeId);

      if (orcamento.status === 'CLOSED') {
        const restantes = await tx.budgetItem.findMany({ where: { budgetId }, select: { budgetNodeId: true } });
        if (restantes.every((linha) => ids.includes(linha.budgetNodeId))) {
          throw new BadRequestException(FECHADO_SEM_ITENS);
        }
      }

      const itens = await tx.budgetItem.deleteMany({
        where: { budgetId, budgetNodeId: { in: ids } },
      });
      await tx.budgetNode.deleteMany({ where: { budgetId, id: { in: ids } } });

      return { name: node.name, nodes: ids.length, items: itens.count };
    });

    await this.auditLogger.log({
      companyId,
      userId: auditContextStorage.getStore()?.userId ?? null,
      action: 'DELETE',
      entityType: 'BudgetNode',
      entityId: nodeId,
      changes: {
        budgetId,
        name: removidos.name,
        removedNodes: removidos.nodes,
        removedItems: removidos.items,
      },
    });

    return this.findOne(companyId, budgetId);
  }

  // ---------------------------------------------------------------------------
  // Itens
  // ---------------------------------------------------------------------------

  async addItem(companyId: string, budgetId: string, dto: CreateBudgetItemDto) {
    const quantity = exigir(quantityProblem, dto.quantity);

    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, budgetId, 'SHARE');

      const node = await tx.budgetNode.findFirst({
        where: { id: dto.budgetNodeId, budgetId },
        select: { id: true },
      });
      if (!node) throw new BadRequestException(NO_NAO_ENCONTRADO);

      const { item, components, referenceComponents } = await this.resolverOrigem(tx, companyId, budgetId, dto);

      const ultimo = await tx.budgetItem.aggregate({
        where: { budgetId, budgetNodeId: node.id },
        _max: { position: true },
      });

      // Campos nomeados um a um: nada do corpo chega ao banco sem passar por
      // aqui, e total nenhum vem de fora.
      await tx.budgetItem.create({
        data: {
          budgetId,
          budgetNodeId: node.id,
          position: (ultimo._max.position ?? -1) + 1,
          quantity,
          ...item,
          ...(components.length > 0 ? { components: { create: components } } : {}),
          ...(referenceComponents.length > 0 ? { referenceComponents: { create: referenceComponents } } : {}),
        } as never,
      });
    });

    return this.findOne(companyId, budgetId);
  }

  /// Quantidade sempre; custo unitário só de insumo e manual; descrição e
  /// unidade só de manual.
  async updateItem(companyId: string, budgetId: string, itemId: string, dto: UpdateBudgetItemDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, companyId, budgetId, 'SHARE');
      const item = await tx.budgetItem.findFirst({ where: { id: itemId, budgetId } });
      if (!item) throw new NotFoundException(ITEM_NAO_ENCONTRADO);

      const data: Prisma.BudgetItemUncheckedUpdateInput = {};

      if (dto.quantity !== undefined) data.quantity = exigir(quantityProblem, dto.quantity);

      if (dto.unitCost !== undefined) {
        if (item.source === 'COMPOSITION') throw new BadRequestException(CUSTO_DE_COMPOSICAO);
        if (item.source === 'REFERENCE') throw new BadRequestException(CUSTO_DE_REFERENCIA);
        const custo = exigir(unitCostProblem, dto.unitCost);
        data.unitCost = custo;
        if (item.source === 'CATALOG_ITEM') {
          data.referencePriceId = await this.referenciaUsada(
            tx,
            companyId,
            budgetId,
            item.catalogItemId!,
            item.unit,
            custo,
          );
        }
      }

      if (dto.description !== undefined || dto.unit !== undefined) {
        if (item.source !== 'MANUAL') throw new BadRequestException(DADOS_DA_ORIGEM);
        if (dto.description !== undefined) data.description = exigirDescricao(dto.description);
        if (dto.unit !== undefined) data.unit = exigirUnidade(dto.unit);
      }

      await tx.budgetItem.update({ where: { id: itemId }, data });
    });

    return this.findOne(companyId, budgetId);
  }

  async removeItem(companyId: string, budgetId: string, itemId: string) {
    const removido = await this.prisma.$transaction(async (tx) => {
      const orcamento = await this.lockEditable(tx, companyId, budgetId, 'SHARE');
      const item = await tx.budgetItem.findFirst({ where: { id: itemId, budgetId } });
      if (!item) throw new NotFoundException(ITEM_NAO_ENCONTRADO);
      if (orcamento.status === 'CLOSED') {
        const restantes = await tx.budgetItem.findMany({ where: { budgetId }, select: { id: true } });
        if (restantes.length <= 1) throw new BadRequestException(FECHADO_SEM_ITENS);
      }
      await tx.budgetItem.delete({ where: { id: itemId } });
      return item;
    });

    await this.auditLogger.log({
      companyId,
      userId: auditContextStorage.getStore()?.userId ?? null,
      action: 'DELETE',
      entityType: 'BudgetItem',
      entityId: itemId,
      changes: {
        budgetId,
        source: removido.source,
        description: removido.description,
        unit: removido.unit,
        quantity: removido.quantity.toFixed(QUANTITY_SCALE),
        unitCost: removido.unitCost.toFixed(UNIT_COST_SCALE),
        ...(removido.referenceSource
          ? {
              referenceSource: removido.referenceSource,
              referenceCode: removido.referenceCode,
              referenceCompetence: removido.referenceCompetence,
            }
          : {}),
      },
    });

    return this.findOne(companyId, budgetId);
  }

  // ---------------------------------------------------------------------------
  // Para a importação de planilha
  // ---------------------------------------------------------------------------

  /// Trava a linha do orçamento até o fim da transação e devolve o status.
  /// Rascunho e fechado são editáveis; quem só vale para rascunho (excluir,
  /// fechar) confere o status devolvido.
  async lockEditable(tx: Tx, companyId: string, id: string, modo: 'SHARE' | 'UPDATE') {
    const linhas =
      modo === 'UPDATE'
        ? await tx.$queryRaw<{ id: string; code: string; status: string }[]>`
            SELECT id, code, status::text AS status FROM "Budget"
             WHERE id = ${id}::uuid AND "companyId" = ${companyId}::uuid AND "deletedAt" IS NULL
             FOR UPDATE`
        : await tx.$queryRaw<{ id: string; code: string; status: string }[]>`
            SELECT id, code, status::text AS status FROM "Budget"
             WHERE id = ${id}::uuid AND "companyId" = ${companyId}::uuid AND "deletedAt" IS NULL
             FOR SHARE`;

    const orcamento = linhas[0];
    if (!orcamento) throw new NotFoundException(NAO_ENCONTRADO);
    return orcamento;
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /// O que a linha copia da origem — é aqui que o snapshot nasce.
  private async resolverOrigem(
    tx: Tx,
    companyId: string,
    budgetId: string,
    dto: CreateBudgetItemDto,
  ): Promise<Snapshot> {
    const REFERENCIA: (keyof CreateBudgetItemDto)[] = ['referenceItemId', 'referenceCompositionId'];

    switch (dto.source) {
      case 'COMPOSITION': {
        proibir(dto, ['catalogItemId', 'unitCost', 'description', 'unit', ...REFERENCIA], 'Item de composição usa a descrição, a unidade e o custo da composição.');
        if (!dto.compositionId) throw new BadRequestException('Escolha a composição.');

        const composicao = await tx.composition.findFirst({
          where: { id: dto.compositionId, companyId, deletedAt: null },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
              include: { catalogItem: { select: { code: true, name: true, type: true, unit: true } } },
            },
          },
        });
        if (!composicao) throw new BadRequestException('Composição não encontrada.');

        const dataBase = await this.dataBase(tx, budgetId);
        const vigentes = await latestReferencePriceRows(
          tx,
          companyId,
          composicao.items.map((linha) => linha.catalogItemId),
          dateToDateOnly(dataBase),
        );
        return comoRecusa(() => compositionSnapshot(composicao, vigentes));
      }

      case 'CATALOG_ITEM': {
        proibir(dto, ['compositionId', 'description', 'unit', ...REFERENCIA], 'Item de insumo usa a descrição e a unidade do insumo.');
        if (!dto.catalogItemId) throw new BadRequestException('Escolha o insumo.');

        const insumo = await tx.catalogItem.findFirst({
          where: { id: dto.catalogItemId, companyId, deletedAt: null },
          select: { id: true, code: true, name: true, unit: true, type: true, active: true },
        });
        if (!insumo) throw new BadRequestException('Insumo não encontrado.');
        if (!insumo.active) {
          throw new BadRequestException('Este insumo está desativado e não pode entrar no orçamento.');
        }
        if (dto.unitCost === undefined) {
          throw new BadRequestException(
            'Informe o custo unitário. O preço de referência vigente na data-base aparece como sugestão.',
          );
        }
        const custo = exigir(unitCostProblem, dto.unitCost);
        const snapshot = comoRecusa(() => catalogItemSnapshot(insumo, custo, undefined));
        snapshot.item.referencePriceId = await this.referenciaUsada(tx, companyId, budgetId, insumo.id, insumo.unit, custo);
        return snapshot;
      }

      case 'MANUAL': {
        proibir(dto, ['compositionId', 'catalogItemId', ...REFERENCIA], 'Item manual não aponta para composição, insumo nem base referencial.');
        if (dto.unitCost === undefined) throw new BadRequestException('Informe o custo unitário.');
        return {
          item: {
            source: 'MANUAL',
            sourceCode: null,
            description: exigirDescricao(dto.description),
            unit: exigirUnidade(dto.unit),
            unitCost: exigir(unitCostProblem, dto.unitCost),
          },
          components: [],
          referenceComponents: [],
        };
      }

      case 'REFERENCE': {
        proibir(dto, ['compositionId', 'catalogItemId', 'unitCost', 'description', 'unit'], 'Item de base referencial usa o código, a descrição, a unidade e o custo publicados pela base.');
        if (Boolean(dto.referenceItemId) === Boolean(dto.referenceCompositionId)) {
          throw new BadRequestException('Escolha um insumo OU uma composição da base referencial.');
        }

        const dataBase = await this.dataBase(tx, budgetId);

        if (dto.referenceItemId) {
          const insumo = await tx.referenceItem.findUnique({
            where: { id: dto.referenceItemId },
            include: { dataset: true },
          });
          if (!insumo) throw new BadRequestException('Insumo da base referencial não encontrado.');
          return comoRecusa(() =>
            referenceSnapshot(
              { kind: 'ITEM', id: insumo.id, code: insumo.code, description: insumo.description, unit: insumo.unit, price: insumo.unitPrice, components: [] },
              insumo.dataset,
              dataBase,
            ),
          );
        }

        const composicao = await tx.referenceComposition.findUnique({
          where: { id: dto.referenceCompositionId },
          include: { dataset: true, components: { orderBy: { position: 'asc' } } },
        });
        if (!composicao) throw new BadRequestException('Composição da base referencial não encontrada.');
        return comoRecusa(() =>
          referenceSnapshot(
            {
              kind: 'COMPOSITION',
              id: composicao.id,
              code: composicao.code,
              description: composicao.description,
              unit: composicao.unit,
              price: composicao.unitCost,
              components: composicao.components,
            },
            composicao.dataset,
            dataBase,
          ),
        );
      }

      default:
        throw new BadRequestException('Origem inválida.');
    }
  }

  private async dataBase(tx: Tx, budgetId: string): Promise<Date> {
    const orcamento = await tx.budget.findFirstOrThrow({
      where: { id: budgetId },
      select: { referenceDate: true },
    });
    return orcamento.referenceDate;
  }

  /// O preço de referência VIGENTE NA DATA-BASE, se o custo informado for
  /// exatamente ele. É rastreio: diz "este custo é a referência de 10/09". Se
  /// a pessoa digitou outro valor, fica nulo.
  private async referenciaUsada(
    tx: Tx,
    companyId: string,
    budgetId: string,
    catalogItemId: string,
    unit: string,
    custo: Prisma.Decimal,
  ): Promise<string | null> {
    const referenceDate = await this.dataBase(tx, budgetId);
    const vigente = await tx.catalogItemPrice.findFirst({
      where: { companyId, catalogItemId, referenceDate: { lte: referenceDate } },
      orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, unitPrice: true, unit: true },
    });
    return vigente && vigente.unit === unit && vigente.unitPrice.equals(custo) ? vigente.id : null;
  }

  private async assertBudget(companyId: string, id: string) {
    const orcamento = await this.prisma.budget.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, referenceDate: true, status: true },
    });
    if (!orcamento) throw new NotFoundException(NAO_ENCONTRADO);
    return orcamento;
  }

  private async assertNode(tx: Tx, budgetId: string, nodeId: string) {
    const node = await tx.budgetNode.findFirst({ where: { id: nodeId, budgetId } });
    if (!node) throw new NotFoundException(NO_NAO_ENCONTRADO);
    return node;
  }

  private async assertConstructionSite(companyId: string, id: string) {
    const obra = await this.prisma.constructionSite.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    // 400: o erro é do corpo, que aponta para uma obra que esta empresa não tem.
    if (!obra) throw new BadRequestException(OBRA_NAO_ENCONTRADA);
  }
}

function comoRecusa<T>(montar: () => T): T {
  try {
    return montar();
  } catch (error) {
    if (error instanceof SnapshotProblem) throw new BadRequestException(error.message);
    throw error;
  }
}

function exigir(regra: (valor: unknown) => string | null, valor: unknown): Prisma.Decimal {
  const problema = regra(valor);
  if (problema) throw new BadRequestException(problema);
  return toDecimal(valor)!;
}

function exigirDescricao(valor: string | undefined): string {
  const descricao = valor?.trim();
  if (!descricao) throw new BadRequestException('Informe a descrição do item.');
  return descricao;
}

function exigirUnidade(valor: string | undefined): string {
  if (!valor || !isCanonicalUnit(valor)) throw new BadRequestException('Escolha uma unidade válida.');
  return valor;
}

function proibir(dto: CreateBudgetItemDto, campos: (keyof CreateBudgetItemDto)[], mensagem: string) {
  if (campos.some((campo) => dto[campo] !== undefined)) throw new BadRequestException(mensagem);
}

function buscaPor(search: string | undefined): Prisma.BudgetWhereInput {
  const termo = search?.trim();
  if (!termo) return {};
  return {
    OR: [
      { searchKey: { contains: escapeLikePattern(normalizeCatalogKey(termo)) } },
      { code: { contains: termo.toUpperCase(), mode: 'insensitive' } },
      { constructionSite: { name: { contains: termo, mode: 'insensitive' } } },
    ],
  };
}

/// O orçamento com a EAP numerada, os subtotais, o resumo (custo direto, BDI,
/// preço final) e os itens com a origem rastreável. Os números saem como
/// texto: o monetário em centavos e o exato ao lado.
function detalhar(orcamento: BudgetDetail) {
  const arvore = buildBudgetTree(orcamento.nodes, orcamento.items);
  const total = moneyPair(arvore.totalExact);
  const preco = budgetPrice(arvore.totalExact, orcamento.bdiPercent ?? 0);
  const codigos = buildItemCodes(arvore.nodes, orcamento.nodes, orcamento.items);
  const { currentBudgetId, ...obra } = orcamento.constructionSite;

  return {
    id: orcamento.id,
    code: orcamento.code,
    version: orcamento.version,
    name: orcamento.name,
    description: orcamento.description,
    referenceDate: dateToDateOnly(orcamento.referenceDate),
    status: orcamento.status,
    closedAt: orcamento.closedAt,
    closedBy: orcamento.closedBy,
    createdBy: orcamento.createdBy,
    createdAt: orcamento.createdAt,
    updatedAt: orcamento.updatedAt,
    constructionSite: obra,
    isOfficial: currentBudgetId === orcamento.id,
    revisedFrom: orcamento.revisedFrom ?? null,
    nodeCount: orcamento.nodes.length,
    itemCount: orcamento.items.length,
    totalCost: total.amount,
    totalCostExact: total.exact,
    ...preco,
    bdiNote: orcamento.bdiNote ?? null,
    nodes: arvore.nodes.map(({ node, code, depth, itemCount, subtotalExact }) => {
      const subtotal = moneyPair(subtotalExact);
      return {
        id: node.id,
        parentId: node.parentId,
        code,
        depth,
        name: node.name,
        position: node.position,
        itemCount,
        subtotal: subtotal.amount,
        subtotalExact: subtotal.exact,
      };
    }),
    items: orcamento.items.map((item) => {
      const totalDaLinha = moneyPair(lineTotalExact(item.quantity, item.unitCost));
      return {
        id: item.id,
        budgetNodeId: item.budgetNodeId,
        code: codigos.get(item.id) ?? null,
        position: item.position,
        source: item.source,
        compositionId: item.compositionId,
        catalogItemId: item.catalogItemId,
        referencePriceId: item.referencePriceId,
        sourceCode: item.sourceCode,
        catalogItemType: item.catalogItemType,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity.toFixed(QUANTITY_SCALE),
        unitCost: item.unitCost.toFixed(UNIT_COST_SCALE),
        totalCost: totalDaLinha.amount,
        totalCostExact: totalDaLinha.exact,
        compositionPricing: item.compositionPricing ?? null,
        reference:
          item.source === 'REFERENCE' && item.referenceSource
            ? {
                source: item.referenceSource,
                kind: item.referenceKind,
                code: item.referenceCode,
                competence: item.referenceCompetence,
                uf: item.referenceUf,
                locality: item.referenceLocality,
                regime: item.referenceRegime,
                versionLabel: item.referenceVersionLabel,
                datasetId: item.referenceDatasetId,
                referenceItemId: item.referenceItemId,
                referenceCompositionId: item.referenceCompositionId,
              }
            : null,
        components: item.components.map((linha) => ({
          id: linha.id,
          catalogItemId: linha.catalogItemId,
          code: linha.code,
          name: linha.name,
          type: linha.type,
          unit: linha.unit,
          coefficient: linha.coefficient.toFixed(COEFFICIENT_SCALE),
          unitPrice: linha.unitPrice.toFixed(PRICE_SCALE),
          totalCost: itemCost(linha.coefficient, linha.unitPrice).toFixed(COST_SCALE),
          priceOrigin: linha.priceOrigin ?? null,
          referencePriceId: linha.referencePriceId ?? null,
        })),
        referenceComponents: (item.referenceComponents ?? []).map((linha) => ({
          id: linha.id,
          position: linha.position,
          section: linha.section,
          kind: linha.kind,
          code: linha.code,
          description: linha.description,
          unit: linha.unit,
          coefficient: linha.coefficient?.toFixed(7) ?? null,
          unitPrice: linha.unitPrice?.toFixed(PRICE_SCALE) ?? null,
          totalCost: linha.totalCost?.toFixed(PRICE_SCALE) ?? null,
          situation: linha.situation,
        })),
      };
    }),
  };
}

export type BudgetDetailView = ReturnType<typeof detalhar>;
