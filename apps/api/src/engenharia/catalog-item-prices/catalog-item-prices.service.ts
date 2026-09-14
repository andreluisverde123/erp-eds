import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PRICE_SCALE, toDecimal, unitPriceProblem } from '../compositions/composition-cost';
import {
  CreateManualPriceDto,
  CreatePurchasePriceDto,
  QueryPriceHistoryDto,
} from './dto/catalog-item-price.dto';
import { evaluatePurchaseLine, PURCHASE_BLOCK_MESSAGES } from './purchase-price';
import { dateOnlyToDate, dateToDateOnly, isDateOnly, todayIn } from './reference-date';

const INSUMO_NAO_ENCONTRADO = 'Insumo não encontrado.';
const DATA_FUTURA =
  'A data de referência não pode ser futura. Um preço de referência registra o que se sabia até hoje.';
const LINHA_NAO_ENCONTRADA = 'Linha de compra não encontrada.';
const LINHA_DE_OUTRO_INSUMO = 'Esta linha de compra não está ligada a este insumo.';

const APRESENTACAO = {
  createdBy: { select: { name: true } },
  purchaseOrder: { select: { id: true, code: true } },
} satisfies Prisma.CatalogItemPriceInclude;

type PrecoGravado = Prisma.CatalogItemPriceGetPayload<{ include: typeof APRESENTACAO }>;

/// O mais recente primeiro: maior data de referência e, no empate, o último
/// registrado. É a MESMA ordem do histórico e da consulta por data.
const MAIS_RECENTE_PRIMEIRO: Prisma.CatalogItemPriceOrderByWithRelationInput[] = [
  { referenceDate: 'desc' },
  { createdAt: 'desc' },
];

const LINHA_DE_COMPRA = {
  purchaseRequestItem: { select: { catalogItemId: true } },
  purchaseOrder: {
    select: {
      id: true,
      code: true,
      status: true,
      issueDate: true,
      totalAmount: true,
      supplier: { select: { legalName: true, tradeName: true } },
      items: { select: { totalPrice: true } },
    },
  },
} satisfies Prisma.PurchaseOrderItemInclude;

/// Histórico de preços de referência dos insumos.
///
/// ## O que este service NÃO tem
///
/// Método de edição e de exclusão. O histórico só cresce: corrigir é registrar
/// de novo. Há teste que falha se um aparecer.
///
/// ## Isolamento
///
/// Todo acesso começa conferindo o insumo contra a empresa da sessão (404 se
/// não for dela), e toda consulta de preço filtra `companyId` também — a
/// segunda barreira para o dia em que um insumo trocasse de empresa por fora.
@Injectable()
export class CatalogItemPricesService {
  constructor(private readonly prisma: PrismaService) {}

  async history(companyId: string, catalogItemId: string, query: QueryPriceHistoryDto) {
    await this.assertCatalogItem(companyId, catalogItemId);
    const { page, limit } = query;
    const where: Prisma.CatalogItemPriceWhereInput = { companyId, catalogItemId };

    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.catalogItemPrice.findMany({
        where,
        orderBy: MAIS_RECENTE_PRIMEIRO,
        include: APRESENTACAO,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.catalogItemPrice.count({ where }),
    ]);

    return paginate(linhas.map(apresentar), total, page, limit);
  }

  /// O preço VIGENTE numa data: o de maior `referenceDate <= date`. Sem data,
  /// hoje. Preço posterior à data nunca é usado para ela.
  async priceAt(companyId: string, catalogItemId: string, date?: string) {
    const insumo = await this.assertCatalogItem(companyId, catalogItemId);
    const asOf = date ?? todayIn();

    const vigente = await this.prisma.catalogItemPrice.findFirst({
      where: { companyId, catalogItemId, referenceDate: { lte: dateOnlyToDate(asOf) } },
      orderBy: MAIS_RECENTE_PRIMEIRO,
      include: APRESENTACAO,
    });

    return { asOf, unit: insumo.unit, price: vigente ? apresentar(vigente) : null };
  }

  async registerManual(
    companyId: string,
    userId: string,
    catalogItemId: string,
    dto: CreateManualPriceDto,
  ) {
    const insumo = await this.assertCatalogItem(companyId, catalogItemId);

    const problema = unitPriceProblem(dto.unitPrice);
    if (problema) throw new BadRequestException(problema);
    if (!isDateOnly(dto.referenceDate)) {
      throw new BadRequestException('Data inválida. Use o formato AAAA-MM-DD.');
    }
    if (dto.referenceDate > todayIn()) throw new BadRequestException(DATA_FUTURA);

    // SEMPRE `create`. Nunca `upsert`, nunca `update` do anterior: um segundo
    // preço na mesma data é um segundo registro, e o último registrado vence
    // no empate.
    const criado = await this.prisma.catalogItemPrice.create({
      data: {
        companyId,
        catalogItemId: insumo.id,
        unitPrice: toDecimal(dto.unitPrice)!,
        unit: insumo.unit,
        source: 'MANUAL',
        referenceDate: dateOnlyToDate(dto.referenceDate),
        note: dto.note?.trim() || null,
        createdById: userId,
      },
      include: APRESENTACAO,
    });

    return apresentar(criado);
  }

  /// Linhas de ordens de compra RECEBIDAS ligadas a este insumo, com o preço
  /// praticado e o motivo, quando houver, de não poderem virar referência.
  ///
  /// Nada é gravado aqui: é a lista de onde alguém ESCOLHE registrar.
  async purchaseCandidates(companyId: string, catalogItemId: string) {
    const insumo = await this.assertCatalogItem(companyId, catalogItemId);

    const linhas = await this.prisma.purchaseOrderItem.findMany({
      where: {
        purchaseRequestItem: { catalogItemId },
        purchaseOrder: { companyId, deletedAt: null, status: 'RECEIVED' },
      },
      include: LINHA_DE_COMPRA,
      orderBy: { purchaseOrder: { issueDate: 'desc' } },
      take: 50,
    });

    const jaRegistradas = new Set(
      (
        await this.prisma.catalogItemPrice.findMany({
          where: { companyId, purchaseOrderItemId: { in: linhas.map((linha) => linha.id) } },
          select: { purchaseOrderItemId: true },
        })
      ).map((preco) => preco.purchaseOrderItemId),
    );

    const hoje = todayIn();
    return linhas.map((linha) => {
      const avaliacao = evaluatePurchaseLine(linha, insumo.unit, hoje);
      const block = jaRegistradas.has(linha.id) ? 'ALREADY_REGISTERED' : avaliacao.block;
      const fornecedor = linha.purchaseOrder.supplier;

      return {
        purchaseOrderItemId: linha.id,
        purchaseOrder: {
          id: linha.purchaseOrder.id,
          code: linha.purchaseOrder.code,
          supplierName: fornecedor.tradeName ?? fornecedor.legalName,
        },
        description: linha.description,
        quantity: linha.quantity.toString(),
        unit: linha.unit,
        /// O preço DE TABELA da linha, só para comparação na tela.
        listUnitPrice: linha.unitPrice.toFixed(2),
        practicedUnitPrice: avaliacao.unitPrice?.toFixed(PRICE_SCALE) ?? null,
        referenceDate: avaliacao.referenceDate,
        block,
        blockMessage: block ? PURCHASE_BLOCK_MESSAGES[block] : null,
      };
    });
  }

  /// Registra o preço praticado numa linha de ordem recebida.
  ///
  /// É uma AÇÃO EXPLÍCITA, e não um gatilho em Compras. O status da ordem é
  /// livre (`RECEIVED` pode voltar a `OPEN`) e editar uma ordem recria as
  /// linhas dela, então nenhum evento de Compras garante sozinho que "este
  /// foi o preço". Quem registra afirma; o registro guarda de onde veio.
  async registerFromPurchase(
    companyId: string,
    userId: string,
    catalogItemId: string,
    dto: CreatePurchasePriceDto,
  ) {
    const insumo = await this.assertCatalogItem(companyId, catalogItemId);

    const linha = await this.prisma.purchaseOrderItem.findFirst({
      where: {
        id: dto.purchaseOrderItemId,
        purchaseOrder: { companyId, deletedAt: null },
      },
      include: LINHA_DE_COMPRA,
    });
    if (!linha) throw new BadRequestException(LINHA_NAO_ENCONTRADA);
    if (linha.purchaseRequestItem.catalogItemId !== insumo.id) {
      throw new BadRequestException(LINHA_DE_OUTRO_INSUMO);
    }

    const avaliacao = evaluatePurchaseLine(linha, insumo.unit, todayIn());
    if (avaliacao.block) throw new BadRequestException(PURCHASE_BLOCK_MESSAGES[avaliacao.block]);

    try {
      const criado = await this.prisma.catalogItemPrice.create({
        data: {
          companyId,
          catalogItemId: insumo.id,
          unitPrice: avaliacao.unitPrice!,
          unit: insumo.unit,
          source: 'PURCHASE',
          referenceDate: dateOnlyToDate(avaliacao.referenceDate),
          note: dto.note?.trim() || null,
          purchaseOrderId: linha.purchaseOrder.id,
          purchaseOrderItemId: linha.id,
          createdById: userId,
        },
        include: APRESENTACAO,
      });
      return apresentar(criado);
    } catch (error) {
      // A unique de `purchaseOrderItemId` recusa a mesma linha duas vezes.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(PURCHASE_BLOCK_MESSAGES.ALREADY_REGISTERED);
      }
      throw error;
    }
  }

  /// Insumo excluído não tem histórico consultável; DESATIVADO tem — preço é
  /// informação do passado, e desativar é decisão sobre o futuro.
  private async assertCatalogItem(companyId: string, catalogItemId: string) {
    const insumo = await this.prisma.catalogItem.findFirst({
      where: { id: catalogItemId, companyId, deletedAt: null },
      select: { id: true, unit: true },
    });
    if (!insumo) throw new NotFoundException(INSUMO_NAO_ENCONTRADO);
    return insumo;
  }
}

function apresentar(preco: PrecoGravado) {
  return {
    id: preco.id,
    catalogItemId: preco.catalogItemId,
    unitPrice: preco.unitPrice.toFixed(PRICE_SCALE),
    unit: preco.unit,
    source: preco.source,
    referenceDate: dateToDateOnly(preco.referenceDate),
    note: preco.note,
    purchaseOrder: preco.purchaseOrder
      ? { id: preco.purchaseOrder.id, code: preco.purchaseOrder.code }
      : null,
    createdBy: preco.createdBy ? { name: preco.createdBy.name } : null,
    createdAt: preco.createdAt,
  };
}
