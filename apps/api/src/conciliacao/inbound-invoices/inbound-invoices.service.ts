import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type InboundInvoiceStatus } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { onlyDigits } from '../../common/utils/document.util';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import { QueryInboundInvoiceDto } from './dto/query-inbound-invoice.dto';
import { ReconcileInboundInvoiceDto } from './dto/reconcile-inbound-invoice.dto';
import {
  buildCompatibilityReport,
  type ComparableItem,
  type CompatibilityReport,
  type ItemComparison,
} from './compatibility.util';
import { buildInstallments, scoreCandidate, type SuggestionScore } from './reconciliation.util';

const NOT_FOUND_MESSAGE = 'Nota fiscal não encontrada.';
const DUPLICATE_MESSAGE = 'Esta nota fiscal já foi lançada (mesmo emitente, série e número).';

/// Status a partir dos quais a nota ainda pode ser conciliada. `RECONCILED` e
/// `DIVERGENT` ficam de fora de propósito: é o que impede a mesma nota de ser
/// conciliada duas vezes.
const RECONCILABLE_STATUSES: InboundInvoiceStatus[] = ['PENDING'];

/// Notas que já consumiram saldo de uma ordem de compra. `DIVERGENT` conta
/// junto: a nota foi vinculada e virou conta a pagar, o fato de o valor não
/// bater não a torna menos real para o saldo da ordem.
const CONSUMING_STATUSES: InboundInvoiceStatus[] = ['RECONCILED', 'DIVERGENT'];

const listArgs = Prisma.validator<Prisma.InboundInvoiceDefaultArgs>()({
  include: {
    supplier: { select: { id: true, legalName: true, tradeName: true, document: true } },
    purchaseOrder: { select: { id: true, code: true, totalAmount: true } },
  },
});

const detailArgs = Prisma.validator<Prisma.InboundInvoiceDefaultArgs>()({
  include: {
    supplier: listArgs.include.supplier,
    items: { orderBy: { createdAt: 'asc' } },
    reconciledBy: { select: { id: true, name: true } },
    invoice: { select: { id: true, number: true, status: true } },
    // A ordem vinculada vem COMPLETA aqui (não só id/código como na listagem)
    // porque numa nota já conciliada é ela que preenche o lado direito da
    // comparação — as sugestões não são mais buscadas, e sem estes campos a
    // tela de uma nota conciliada perderia exatamente a rastreabilidade que o
    // vínculo permanente promete.
    purchaseOrder: {
      select: {
        id: true,
        code: true,
        totalAmount: true,
        issueDate: true,
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        constructionSite: { select: { id: true, code: true, name: true } },
        /// Os itens da ORDEM, com a origem de cada linha. É o que completa a
        /// cadeia que a conciliação promete: nota -> ordem -> item -> item da
        /// solicitação -> obra, tudo por relacionamento, sem duplicar dado.
        items: {
          select: {
            description: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
            purchaseRequestItem: {
              select: {
                id: true,
                quantity: true,
                unit: true,
                purchaseRequest: { select: { id: true, code: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        purchaseRequest: { select: { id: true, code: true } },
      },
    },
  },
});

export type InboundInvoiceRow = Prisma.InboundInvoiceGetPayload<typeof listArgs>;
export type InboundInvoiceDetail = Prisma.InboundInvoiceGetPayload<typeof detailArgs>;

/// Ordem de compra oferecida como candidata na tela de conciliação, com tudo
/// que o lado direito da comparação precisa exibir.
export interface PurchaseOrderSuggestion {
  id: string;
  code: string;
  issueDate: Date;
  totalAmount: Prisma.Decimal;
  /// Já conciliado por outras notas — o que permite uma ordem receber entregas
  /// parciais sem estourar o valor aprovado.
  reconciledAmount: Prisma.Decimal;
  openAmount: Prisma.Decimal;
  supplier: { id: string; legalName: string; tradeName: string | null; document: string };
  costCenter: { id: string; code: string; name: string } | null;
  constructionSite: { id: string; code: string; name: string } | null;
  /// Itens da ORDEM — o que foi efetivamente comprado, com quantidade e preço
  /// negociados. Antes vinham da solicitação (o que foi PEDIDO, com preço
  /// estimado), porque a ordem não tinha itens próprios.
  items: {
    description: string;
    quantity: Prisma.Decimal;
    unit: string;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
  }[];
  /// A conferência lado a lado já resolvida no servidor: fornecedor, valor,
  /// itens, obra e data. Ver `compatibility.util.ts`.
  compatibility: CompatibilityReport;
  score: number;
  amountDifference: Prisma.Decimal;
  daysApart: number;
  withinTolerance: boolean;
  /// A melhor candidata, e só quando ela é claramente melhor que a segunda
  /// (ver `markPrimary`). Sem isso, "sugestão principal" viraria só "a
  /// primeira da lista", que é uma recomendação que o sistema não tem base
  /// para fazer.
  isPrimary: boolean;
}

@Injectable()
export class InboundInvoicesService {
  private readonly logger = new Logger(InboundInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /// Entrada manual da nota. O CNPJ é normalizado para só dígitos e usado para
  /// tentar casar com um fornecedor cadastrado — sem sucesso, a nota entra
  /// mesmo assim: uma nota de emitente desconhecido é exatamente o caso que o
  /// financeiro precisa VER, não o caso que o sistema deve recusar.
  async create(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    dto: CreateInboundInvoiceDto,
  ): Promise<InboundInvoiceDetail> {
    const supplierDocument = onlyDigits(dto.supplierDocument);

    const supplier = await this.prisma.supplier.findFirst({
      where: { companyId, document: supplierDocument, deletedAt: null },
      select: { id: true },
    });

    let createdId: string;
    try {
      const created = await this.prisma.inboundInvoice.create({
        data: {
          companyId,
          supplierName: dto.supplierName,
          supplierDocument,
          supplierId: supplier?.id ?? null,
          number: dto.number,
          series: dto.series ?? null,
          accessKey: dto.accessKey ?? null,
          issueDate: new Date(dto.issueDate),
          totalAmount: dto.totalAmount,
          source: 'MANUAL',
          items: dto.items?.length
            ? {
                create: dto.items.map((item) => ({
                  description: item.description,
                  unit: item.unit ?? null,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                })),
              }
            : undefined,
        },
        select: { id: true },
      });
      createdId = created.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_MESSAGE);
      }
      throw error;
    }

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'CREATE',
      entityType: 'InboundInvoice',
      entityId: createdId,
      ipAddress,
      changes: {
        number: dto.number,
        supplierDocument,
        totalAmount: dto.totalAmount,
        source: 'MANUAL',
      },
    });

    return this.findOne(companyId, createdId);
  }

  async findAll(
    companyId: string,
    query: QueryInboundInvoiceDto,
  ): Promise<PaginatedResult<InboundInvoiceRow>> {
    const { page, limit, search, supplierId, status, dateFrom, dateTo, amountMin, amountMax } =
      query;

    const where: Prisma.InboundInvoiceWhereInput = {
      companyId,
      deletedAt: null,
      supplierId,
      status,
      // Número, emitente e CNPJ no mesmo campo de busca: quem procura uma nota
      // tem um desses três em mãos e não deveria precisar escolher qual.
      OR: search
        ? [
            { number: { contains: search, mode: 'insensitive' } },
            { supplierName: { contains: search, mode: 'insensitive' } },
            { supplierDocument: { contains: onlyDigits(search) || search } },
          ]
        : undefined,
      issueDate: rangeFilter(
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined,
      ),
      totalAmount: rangeFilter(amountMin, amountMax),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inboundInvoice.findMany({
        where,
        ...listArgs,
        // Pendentes primeiro: a tela existe para zerar a fila de conciliação,
        // não para navegar histórico.
        orderBy: [{ status: 'asc' }, { issueDate: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inboundInvoice.count({ where }),
    ]);

    return paginate(rows, total, page, limit);
  }

  async findOne(companyId: string, id: string): Promise<InboundInvoiceDetail> {
    const row = await this.prisma.inboundInvoice.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });
    if (!row) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    return row;
  }

  /// Ordens de compra compatíveis com a nota, da mais provável para a menos.
  ///
  /// O filtro duro é sempre o FORNECEDOR: sugerir a ordem de outro fornecedor
  /// seria propor uma conciliação errada com cara de recomendação. Valor e
  /// data entram como pontuação, não como corte — uma ordem fora da tolerância
  /// continua na lista para escolha manual, só não vem marcada como sugestão.
  ///
  /// Ordens sem saldo em aberto ficam de fora: é a regra de "ordem totalmente
  /// conciliada não recebe outra nota", aplicada já na oferta em vez de só na
  /// hora de recusar.
  async suggestions(companyId: string, id: string): Promise<PurchaseOrderSuggestion[]> {
    const invoice = await this.findOne(companyId, id);

    // Sem fornecedor cadastrado não há SUGESTÃO: o vínculo por CNPJ é o que dá
    // confiança a ela. A tela, porém, não fica sem saída — ela oferece a busca
    // manual de qualquer ordem em aberto (`listOpenOrders`) e o caminho sem
    // ordem de compra. Sugerir é diferente de permitir.
    if (!invoice.supplierId) return [];

    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId,
        supplierId: invoice.supplierId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
      },
      include: {
        supplier: { select: { id: true, legalName: true, tradeName: true, document: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        constructionSite: { select: { id: true, code: true, name: true } },
        /// Os itens da ORDEM, não os da solicitação.
        ///
        /// Antes de a ordem ter itens próprios, o único detalhamento
        /// disponível era o da solicitação — que é o que foi PEDIDO, com
        /// preço estimado. Agora existe o que foi efetivamente COMPRADO, com
        /// quantidade e preço negociados, que é o lado certo para conferir
        /// contra a nota do fornecedor.
        items: {
          select: {
            description: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { issueDate: 'desc' },
      take: 100,
    });

    if (orders.length === 0) return [];

    const reconciledByOrder = await this.reconciledAmountByOrder(
      companyId,
      orders.map((order) => order.id),
    );

    const invoiceSide = this.toInvoiceSide(invoice);

    const candidates = orders
      .map((order) => {
        const reconciledAmount = reconciledByOrder.get(order.id) ?? new Prisma.Decimal(0);
        const openAmount = order.totalAmount.minus(reconciledAmount);

        // A compatibilidade é calculada UMA vez por candidata e reaproveitada
        // no score e na resposta — o casamento de itens é a parte cara, e
        // recalculá-lo na tela ao selecionar seria a mesma conta duas vezes.
        const compatibility = buildCompatibilityReport(invoiceSide, {
          supplierId: order.supplierId,
          supplierDocument: order.supplier.document,
          openAmount,
          issueDate: order.issueDate,
          constructionSite: order.constructionSite,
          items: order.items.map(toComparableItem),
        });

        const score = scoreCandidate(invoice.totalAmount, invoice.issueDate, {
          id: order.id,
          totalAmount: order.totalAmount,
          issueDate: order.issueDate,
          reconciledAmount,
          itemMatchRatio: compatibility.itemsComparable
            ? compatibility.matchedItems / compatibility.items.length
            : null,
        });

        return { order, reconciledAmount, openAmount, score, compatibility };
      })
      // Saldo zerado (ou negativo) = ordem já totalmente conciliada.
      .filter((candidate) => candidate.openAmount.greaterThan(0))
      .sort((a, b) => b.score.score - a.score.score);

    const primaryId = markPrimary(candidates.map((c) => ({ id: c.order.id, score: c.score })));

    return candidates.map(({ order, reconciledAmount, openAmount, score, compatibility }) => ({
      id: order.id,
      code: order.code,
      issueDate: order.issueDate,
      totalAmount: order.totalAmount,
      reconciledAmount,
      openAmount,
      supplier: order.supplier,
      costCenter: order.costCenter,
      constructionSite: order.constructionSite,
      items: order.items,
      compatibility,
      score: score.score,
      amountDifference: score.amountDifference,
      daysApart: score.daysApart,
      withinTolerance: score.withinTolerance,
      isPrimary: order.id === primaryId,
    }));
  }

  /// Traduz a nota recebida para o formato que a camada de comparação usa.
  /// Existe para a comparação não conhecer o Prisma nem o schema.
  private toInvoiceSide(invoice: InboundInvoiceDetail) {
    return {
      supplierId: invoice.supplierId,
      supplierDocument: invoice.supplierDocument,
      totalAmount: invoice.totalAmount,
      issueDate: invoice.issueDate,
      hasFullDocument: invoice.hasFullDocument,
      items: invoice.items.map(toComparableItem),
    };
  }

  /// Relatório de compatibilidade de UMA ordem escolhida — inclusive uma que
  /// não veio nas sugestões (escolha manual, fornecedor diferente).
  ///
  /// A tela precisa disto porque sugerir e comparar são coisas diferentes: o
  /// sistema só sugere ordem do mesmo emitente, mas o usuário pode escolher
  /// qualquer uma, e nesse caso a comparação é ainda mais necessária.
  async compareWithOrder(
    companyId: string,
    id: string,
    purchaseOrderId: string,
  ): Promise<CompatibilityReport> {
    const invoice = await this.findOne(companyId, id);

    // Escopo da empresa na própria consulta: uma ordem de outro tenant não é
    // encontrada, e a comparação nem chega a acontecer.
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, companyId, deletedAt: null },
      include: {
        supplier: { select: { id: true, document: true } },
        constructionSite: { select: { code: true, name: true } },
        items: {
          select: {
            description: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }

    const reconciled =
      (await this.reconciledAmountByOrder(companyId, [order.id])).get(order.id) ??
      new Prisma.Decimal(0);

    return buildCompatibilityReport(this.toInvoiceSide(invoice), {
      supplierId: order.supplierId,
      supplierDocument: order.supplier.document,
      openAmount: order.totalAmount.minus(reconciled),
      issueDate: order.issueDate,
      constructionSite: order.constructionSite,
      items: order.items.map(toComparableItem),
    });
  }

  /// Ordens de compra em aberto para ESCOLHA MANUAL, sem filtro de fornecedor.
  ///
  /// Existe porque sugerir e permitir são coisas diferentes: o sistema só
  /// sugere ordem do mesmo emitente (sugerir errado é pior que não sugerir),
  /// mas o usuário precisa poder escolher quando conhece o caso — por exemplo
  /// uma nota cujo emitente ainda não foi cadastrado como fornecedor. Sem
  /// isto, a tela ficava num beco: nenhuma sugestão e nenhum modo de escolher.
  async listOpenOrders(companyId: string, search?: string) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        code: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      select: {
        id: true,
        code: true,
        issueDate: true,
        totalAmount: true,
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        constructionSite: { select: { id: true, code: true, name: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 50,
    });

    const reconciledByOrder = await this.reconciledAmountByOrder(
      companyId,
      orders.map((order) => order.id),
    );

    return (
      orders
        .map((order) => ({
          ...order,
          reconciledAmount: reconciledByOrder.get(order.id) ?? new Prisma.Decimal(0),
          openAmount: order.totalAmount.minus(
            reconciledByOrder.get(order.id) ?? new Prisma.Decimal(0),
          ),
        }))
        // Ordem sem saldo não pode receber nota — não faz sentido oferecê-la.
        .filter((order) => order.openAmount.greaterThan(0))
    );
  }

  /// Centros de custo para o lançamento SEM ordem de compra. É a informação
  /// que substitui a ordem: sem ela a despesa não pertenceria a nada.
  async listCostCenters(companyId: string) {
    return this.prisma.costCenter.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        constructionSite: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /// Conciliação: vincula a nota à ordem de compra e gera o financeiro.
  ///
  /// Tudo numa transação só — nota vinculada sem conta a pagar, ou conta a
  /// pagar sem vínculo, seriam estados que o financeiro teria de consertar à
  /// mão. A `Invoice` criada aqui é o que conecta este módulo ao financeiro
  /// existente: as parcelas nascem penduradas nela, pelo mesmo caminho de
  /// sempre, sem que este módulo precise conhecer as regras de contas a pagar.
  async reconcile(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    dto: ReconcileInboundInvoiceDto,
  ): Promise<InboundInvoiceDetail> {
    const invoice = await this.findOne(companyId, id);

    if (!RECONCILABLE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(
        invoice.status === 'CANCELLED'
          ? 'Esta nota fiscal está cancelada e não pode ser conciliada.'
          : 'Esta nota fiscal já foi conciliada.',
      );
    }

    // DOIS CAMINHOS. Com ordem de compra, valem as regras de saldo e
    // divergência — a nota é conferida contra um pedido aprovado. Sem ordem
    // (compra de balcão), não há contra o que conferir: o que se exige é o
    // centro de custo, para a despesa ter dono.
    const order = dto.purchaseOrderId
      ? await this.prisma.purchaseOrder.findFirst({
          where: {
            id: dto.purchaseOrderId,
            companyId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
          select: {
            id: true,
            code: true,
            supplierId: true,
            totalAmount: true,
            issueDate: true,
            constructionSiteId: true,
            costCenterId: true,
            supplier: { select: { document: true } },
            constructionSite: { select: { code: true, name: true } },
            items: {
              select: {
                description: true,
                quantity: true,
                unit: true,
                unitPrice: true,
                totalPrice: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        })
      : null;

    if (dto.purchaseOrderId && !order) {
      throw new BadRequestException('Ordem de compra informada não existe ou está cancelada.');
    }

    let costCenterId: string;
    let constructionSiteId: string | null;
    let isDivergent = false;
    /// O que estava divergente na hora de conciliar, em texto, para a
    /// auditoria. Vazio quando não há ordem (não há contra o que conferir).
    let divergenceSummary: string[] = [];

    if (order) {
      // Fornecedor da nota e da ordem têm de ser o mesmo. Sem esta checagem, a
      // escolha manual conseguiria fazer o que a sugestão automática se recusa.
      if (invoice.supplierId && invoice.supplierId !== order.supplierId) {
        throw new BadRequestException(
          'A ordem de compra escolhida é de outro fornecedor. Selecione uma ordem do mesmo emitente da nota.',
        );
      }

      const reconciled =
        (await this.reconciledAmountByOrder(companyId, [order.id])).get(order.id) ??
        new Prisma.Decimal(0);
      const openAmount = order.totalAmount.minus(reconciled);

      if (openAmount.lessThanOrEqualTo(0)) {
        throw new ConflictException(
          `A ordem de compra ${order.code} já está totalmente conciliada e não pode receber outra nota.`,
        );
      }

      // Divergência não bloqueia para sempre — exige aceite. A tela mostra a
      // diferença destacada antes de deixar confirmar; a API é quem garante que
      // ninguém pule esse passo chamando o endpoint direto.
      // O relatório completo (valor, itens, obra, data) é montado aqui para
      // ficar REGISTRADO na auditoria — não para bloquear. A regra de bloqueio
      // continua sendo só a de valor, que é a que já existia: transformar
      // divergência de item em impedimento seria criar regra nova, e o pedido
      // é justamente que o usuário autorizado decida.
      const compatibility = buildCompatibilityReport(this.toInvoiceSide(invoice), {
        supplierId: order.supplierId,
        supplierDocument: order.supplier.document,
        openAmount,
        issueDate: order.issueDate,
        constructionSite: order.constructionSite,
        items: order.items.map(toComparableItem),
      });

      divergenceSummary = [
        ...compatibility.checks
          .filter((check) => check.result === 'DIVERGENT')
          .map((check) => `${check.label}: ${check.detail}`),
        ...compatibility.items
          .filter((item) => item.status !== 'MATCH')
          .map((item) => describeItemDivergence(item)),
      ];

      isDivergent = !invoice.totalAmount.equals(openAmount);
      if (isDivergent && !dto.acceptDivergence) {
        throw new BadRequestException(
          `O valor da nota (${format(invoice.totalAmount)}) difere do saldo em aberto da ordem ${order.code} (${format(openAmount)}). Confirme a divergência para prosseguir.`,
        );
      }

      costCenterId = order.costCenterId;
      constructionSiteId = order.constructionSiteId;
    } else {
      if (!dto.costCenterId) {
        throw new BadRequestException(
          'Sem ordem de compra, informe o centro de custo — é ele que diz a que a despesa pertence.',
        );
      }
      const costCenter = await this.prisma.costCenter.findFirst({
        where: { id: dto.costCenterId, companyId, deletedAt: null },
        select: { id: true, constructionSiteId: true },
      });
      if (!costCenter) {
        throw new BadRequestException('Centro de custo informado não existe.');
      }
      costCenterId = costCenter.id;
      // A obra vem do centro de custo, não é escolhida de novo — mesma regra
      // que a solicitação de compra já usa. Fica nula quando o centro não
      // pertence a obra nenhuma (Escritório, por exemplo).
      constructionSiteId = costCenter.constructionSiteId;
    }

    // Sem fornecedor cadastrado não há como pendurar a nota do financeiro em
    // ninguém: `Invoice.supplierId` é obrigatório. É o caso mais comum na
    // compra de balcão, e a mensagem precisa dizer o que fazer.
    //
    // O vínculo da nota nasce na IMPORTAÇÃO, quando o emitente quase nunca
    // existe ainda no cadastro — e nunca era refeito depois. O efeito é que
    // cadastrar o fornecedor NÃO destravava as notas já na fila: elas ficavam
    // recusadas para sempre, e o caminho de balcão era inalcançável para todas
    // as 1.262 notas já importadas. Daí a segunda busca, por CNPJ, no ato da
    // conciliação — o dado para resolver isso sempre esteve na própria nota.
    let supplierId = order?.supplierId ?? invoice.supplierId;
    if (!supplierId && invoice.supplierDocument) {
      const cadastrado = await this.prisma.supplier.findFirst({
        where: { companyId, document: invoice.supplierDocument, deletedAt: null },
        select: { id: true },
      });
      supplierId = cadastrado?.id ?? null;
    }
    if (!supplierId) {
      throw new BadRequestException(
        `O emitente ${invoice.supplierName} (CNPJ ${invoice.supplierDocument}) não está cadastrado como fornecedor. Cadastre-o em Compras > Fornecedores para conciliar esta nota.`,
      );
    }

    const baseDate = dto.dueDate ? new Date(dto.dueDate) : invoice.issueDate;
    const installments = buildInstallments(invoice.totalAmount, dto.paymentTerms, baseDate);
    const finalStatus: InboundInvoiceStatus = isDivergent ? 'DIVERGENT' : 'RECONCILED';

    await this.prisma.$transaction(async (tx) => {
      // A nota do financeiro nasce já VALIDATED: ela só existe porque a
      // conciliação aconteceu, então passar por RECEIVED seria um estado que
      // nunca foi verdade.
      const created = await tx.invoice.create({
        data: {
          companyId,
          purchaseOrderId: order?.id ?? null,
          supplierId,
          constructionSiteId,
          costCenterId,
          number: invoice.number,
          series: invoice.series,
          issueDate: invoice.issueDate,
          totalAmount: invoice.totalAmount,
          status: 'VALIDATED',
        },
        select: { id: true },
      });

      await tx.accountPayable.createMany({
        data: installments.map((installment) => ({
          companyId,
          // A conta nasce de nota — é o caminho que sempre existiu. O
          // lançamento avulso do Financeiro é o outro (`MANUAL`).
          origin: 'INVOICE' as const,
          invoiceId: created.id,
          // Copiados da nota que acabou de ser criada, para a parcela ter o
          // fornecedor e a atribuição de custo na própria linha.
          supplierId,
          costCenterId,
          constructionSiteId,
          amount: installment.amount,
          dueDate: installment.dueDate,
        })),
      });

      await tx.inboundInvoice.update({
        where: { id, companyId },
        data: {
          status: finalStatus,
          purchaseOrderId: order?.id ?? null,
          // Grava o vínculo que a importação não tinha como fazer, para a nota
          // não continuar dizendo que o emitente é desconhecido depois de
          // virar conta a pagar em nome dele.
          supplierId,
          invoiceId: created.id,
          reconciledAt: new Date(),
          reconciledById: actingUserId,
          paymentMethod: dto.paymentMethod,
          paymentTerms: dto.paymentTerms,
          notes: dto.notes ?? null,
        },
      });
    });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'InboundInvoice',
      entityId: id,
      ipAddress,
      changes: {
        action: 'reconcile',
        // Explícito, e não deduzido da ausência de `purchaseOrderId`: quem ler
        // a auditoria daqui a um ano precisa ver que a nota foi MARCADA como
        // sem ordem, não descobrir isso por um campo nulo.
        withoutPurchaseOrder: order === null,
        purchaseOrderId: order?.id ?? null,
        purchaseOrderCode: order?.code ?? null,
        costCenterId,
        constructionSiteId,
        supplierId,
        status: finalStatus,
        amountAccepted: invoice.totalAmount.toFixed(2),
        // O que estava divergente NO MOMENTO da conciliação, e o aceite
        // explícito de quem confirmou. Sem isto, a divergência ficava só no
        // status e ninguém sabia depois em quê ela consistia.
        divergences: divergenceSummary,
        divergenceAccepted: divergenceSummary.length > 0 ? Boolean(dto.acceptDivergence) : false,
        paymentMethod: dto.paymentMethod,
        paymentTerms: dto.paymentTerms,
        installments: installments.length,
      },
    });

    this.logger.log(
      `Nota ${invoice.number} conciliada ${order ? `com a OC ${order.code}` : 'sem ordem de compra'} ` +
        `(${installments.length} parcela(s), status ${finalStatus}).`,
    );

    return this.findOne(companyId, id);
  }

  /// Cancela uma nota que não deve virar conta a pagar (nota indevida, emitida
  /// em duplicidade, devolvida). Só antes da conciliação: depois dela existe
  /// uma conta a pagar de verdade, e desfazer isso é assunto do financeiro,
  /// não deste módulo.
  async cancel(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
  ): Promise<InboundInvoiceDetail> {
    const invoice = await this.findOne(companyId, id);

    if (invoice.status !== 'PENDING') {
      throw new BadRequestException(
        invoice.status === 'CANCELLED'
          ? 'Esta nota fiscal já está cancelada.'
          : 'Notas já conciliadas não podem ser canceladas por aqui — trate a conta a pagar gerada no módulo Financeiro.',
      );
    }

    await this.prisma.inboundInvoice.update({
      where: { id, companyId },
      data: { status: 'CANCELLED' },
    });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'InboundInvoice',
      entityId: id,
      ipAddress,
      changes: { action: 'cancel' },
    });

    return this.findOne(companyId, id);
  }

  /// Quanto cada ordem de compra já teve conciliado, somando as notas que a
  /// referenciam. Uma consulta agregada para o conjunto todo, nunca uma por
  /// ordem — a tela de sugestões avalia até 100 candidatas de uma vez.
  private async reconciledAmountByOrder(
    companyId: string,
    orderIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    if (orderIds.length === 0) return new Map();

    const rows = await this.prisma.inboundInvoice.groupBy({
      by: ['purchaseOrderId'],
      where: {
        companyId,
        deletedAt: null,
        purchaseOrderId: { in: orderIds },
        status: { in: CONSUMING_STATUSES },
      },
      _sum: { totalAmount: true },
    });

    return new Map(
      rows
        .filter(
          (row): row is typeof row & { purchaseOrderId: string } => row.purchaseOrderId !== null,
        )
        .map((row) => [row.purchaseOrderId, row._sum.totalAmount ?? new Prisma.Decimal(0)]),
    );
  }
}

/// Uma linha (da nota ou da ordem) no formato comum de comparação.
///
/// `InboundInvoiceItem` e `PurchaseOrderItem` guardam o mesmo conceito com
/// precisões diferentes (a nota tem 4 casas no preço; a ordem, 2). Converter
/// os dois para o mesmo formato aqui evita que a comparação precise saber de
/// qual lado cada linha veio.
function toComparableItem(item: {
  description: string;
  unit: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;
}): ComparableItem {
  return {
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  };
}

/// Uma divergência de item em uma linha, para a auditoria e para o log.
function describeItemDivergence(item: ItemComparison): string {
  if (item.status === 'ONLY_IN_INVOICE') {
    return `Item só na nota: ${item.invoice!.description}`;
  }
  if (item.status === 'ONLY_IN_ORDER') {
    return `Item só na ordem: ${item.order!.description}`;
  }

  const campos: Record<string, string> = {
    quantity: 'quantidade',
    unit: 'unidade',
    unitPrice: 'valor unitário',
    totalPrice: 'valor total',
  };
  const quais = item.differences.map((campo) => campos[campo] ?? campo).join(', ');
  return `${item.order!.description}: ${quais} diferem`;
}

function format(value: Prisma.Decimal): string {
  return value.toFixed(2).replace('.', ',');
}

/// Constrói o filtro de intervalo só quando pelo menos um lado foi informado —
/// devolver `{}` faria o Prisma comparar contra um objeto vazio.
function rangeFilter<T>(min: T | undefined, max: T | undefined) {
  if (min === undefined && max === undefined) return undefined;
  return { gte: min, lte: max };
}

/// Diferença mínima de pontuação para chamar a melhor candidata de "sugestão
/// principal". Duas ordens quase empatadas não têm vencedora: apontar uma
/// delas seria dar ao usuário uma confiança que o sistema não tem.
const PRIMARY_MARGIN = 0.15;

function markPrimary(candidates: { id: string; score: SuggestionScore }[]): string | null {
  const [best, second] = candidates;
  if (!best || !best.score.withinTolerance) return null;
  if (second && best.score.score - second.score.score < PRIMARY_MARGIN) return null;
  return best.id;
}
