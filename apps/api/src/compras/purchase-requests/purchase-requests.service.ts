import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type PurchaseRequestStatus } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { ApprovalThresholdService } from '../../common/approval/approval-threshold.service';
import { renderDocumentPdf, type RenderedPdf } from '../../common/pdf/pdf-renderer';
import { COMPANY_HEADER_SELECT } from '../../common/pdf/printable-document';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPurchaseRequestDocument } from './pdf/purchase-request-document';
import {
  calculateItemTotals,
  calculateQuoteTotals,
  isQuoted,
  type Discount,
  type QuoteItem,
} from './quote-totals';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { UpdatePurchaseRequestQuoteDto } from './dto/update-purchase-request-quote.dto';

const listArgs = Prisma.validator<Prisma.PurchaseRequestDefaultArgs>()({
  include: {
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    requestedBy: { select: { id: true, name: true } },
    items: {
      select: {
        quantity: true,
        estimatedUnitPrice: true,
        unavailable: true,
        discountType: true,
        discountValue: true,
      },
    },
  },
});

const detailArgs = Prisma.validator<Prisma.PurchaseRequestDefaultArgs>()({
  include: {
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    requestedBy: { select: { id: true, name: true } },
    items: { orderBy: { createdAt: 'asc' } },
  },
});

/// O PDF precisa de menos do que a tela de detalhe: nada de histórico de
/// auditoria nem de ordens emitidas. Um validator próprio deixa isso explícito
/// e evita carregar o `auditLog` inteiro só para imprimir uma folha.
const pdfArgs = Prisma.validator<Prisma.PurchaseRequestDefaultArgs>()({
  include: {
    constructionSite: { select: { code: true, name: true } },
    costCenter: { select: { code: true, name: true } },
    requestedBy: { select: { name: true } },
    items: { orderBy: { createdAt: 'asc' } },
  },
});

type ListRow = Prisma.PurchaseRequestGetPayload<typeof listArgs>;

/// Sem aprovação em níveis: cada status só anda pra frente ou vai direto pra
/// CANCELLED. CANCELLED é terminal.
const ALLOWED_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['QUOTING', 'CANCELLED'],
  QUOTING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  CANCELLED: [],
};

/// O que o solicitante faz sozinho, a partir do rascunho: mandar para Compras
/// ou desistir. Ver a checagem em `updateStatus`.
const REQUESTER_TRANSITIONS: PurchaseRequestStatus[] = ['PENDING', 'CANCELLED'];

/// O que a solicitação carrega para a conta: as linhas e o desconto geral.
type QuotedRow = { items: QuoteItem[]; discountType: 'AMOUNT' | 'PERCENT'; discountValue: unknown };

function generalDiscountOf(row: {
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: unknown;
}): Discount {
  return { type: row.discountType, value: row.discountValue as Prisma.Decimal };
}

/// Anexa o resumo financeiro à solicitação.
///
/// `estimatedTotal` é o TOTAL FINAL, depois dos dois descontos — é o número
/// que a alçada de aprovação usa e o que a listagem mostra. Continua sendo
/// DERIVADO a cada leitura: nunca houve total gravado em `PurchaseRequest`, e
/// criar um agora seriam dois números para a mesma verdade.
///
/// `totals` abre a conta em etapas para a tela não precisar refazê-la (e não
/// chegar a um resultado diferente do servidor). A regra inteira mora em
/// `quote-totals.ts`.
function withEstimatedTotal<T extends QuotedRow>(row: T) {
  const totals = calculateQuoteTotals(row.items, generalDiscountOf(row));

  return {
    ...row,
    estimatedTotal: totals.total.toNumber(),
    totals: {
      itemsSubtotal: totals.itemsSubtotal.toNumber(),
      itemsDiscount: totals.itemsDiscount.toNumber(),
      subtotalAfterItemDiscounts: totals.subtotalAfterItemDiscounts.toNumber(),
      generalDiscount: totals.generalDiscount.toNumber(),
      total: totals.total.toNumber(),
    },
  };
}

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalThreshold: ApprovalThresholdService,
  ) {}

  async create(companyId: string, userId: string, dto: CreatePurchaseRequestDto) {
    await this.assertObraECentroDeCusto(companyId, dto.constructionSiteId, dto.costCenterId);

    const code = await nextSequentialCode(
      () => this.prisma.purchaseRequest.count({ where: { companyId } }),
      'SOL',
    );

    const created = await this.prisma.purchaseRequest.create({
      data: {
        companyId,
        constructionSiteId: dto.constructionSiteId,
        costCenterId: dto.costCenterId ?? null,
        requestedById: userId,
        code,
        notes: dto.notes,
        items: { create: dto.items.map((item) => ({ ...item })) },
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryPurchaseRequestDto,
  ): Promise<PaginatedResult<ListRow & { estimatedTotal: number }>> {
    const { page, limit, search, status, constructionSiteId, costCenterId, dateFrom, dateTo } =
      query;

    const where: Prisma.PurchaseRequestWhereInput = {
      companyId,
      deletedAt: null,
      status,
      constructionSiteId,
      costCenterId,
      createdAt:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
      // O centro de custo é o destino da solicitação (obra, escritório,
      // fazenda...), então ele entra na busca por texto junto com o código.
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { costCenter: { name: { contains: search, mode: 'insensitive' } } },
            { constructionSite: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        ...listArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return paginate(rows.map(withEstimatedTotal), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    const history = await this.prisma.auditLog.findMany({
      where: { companyId, entityType: 'PurchaseRequest', entityId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { ...withEstimatedTotal(request), history };
  }

  async update(companyId: string, id: string, dto: UpdatePurchaseRequestDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'DRAFT') {
      throw new ConflictException('Só é possível editar solicitações em rascunho.');
    }

    // O patch é parcial, mas a coerência entre obra e centro de custo é uma
    // propriedade do PAR — validar só o que veio deixaria passar a edição que
    // troca a obra e mantém um centro de custo que era da obra anterior. Por
    // isso o estado final é montado antes, sobrepondo o patch ao que já existe.
    const constructionSiteId = dto.constructionSiteId ?? existing.constructionSiteId;
    const costCenterId = dto.costCenterId === undefined ? existing.costCenterId : dto.costCenterId;

    await this.assertObraECentroDeCusto(companyId, constructionSiteId, costCenterId);

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequest.update({
        where: { id, companyId },
        data: {
          constructionSiteId,
          costCenterId,
          notes: dto.notes,
        },
      });

      if (dto.items) {
        await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } });
        await tx.purchaseRequestItem.createMany({
          data: dto.items.map((item) => ({ ...item, purchaseRequestId: id })),
        });
      }
    });

    return this.findOne(companyId, id);
  }

  /// Cotação pelo setor de Compras. Existe porque o valor unitário saiu do
  /// formulário de solicitação (quem pede não conhece o preço) — sem um lugar
  /// para informá-lo depois, toda solicitação valeria zero e a alçada de
  /// aprovação por valor deixaria de valer.
  ///
  /// Só roda em PENDING e QUOTING: em DRAFT a solicitação ainda é do
  /// solicitante (que edita pela tela normal), e depois de aprovada o valor
  /// que vale é o negociado na ordem de compra.
  ///
  /// COTAÇÃO PARCIAL. O fornecedor pode não ter tudo, e desde sempre pôde —
  /// o que faltava era como dizer isso. Cada linha chega em um de três
  /// estados (ver o DTO), e nenhum deles exige que a solicitação inteira
  /// tenha preço. O que a cotação não pode ser é vazia: ao menos um item
  /// disponível precisa vir com valor, senão não há o que aprovar.
  ///
  /// A solicitação continua ÍNTEGRA: marcar indisponível não apaga a linha
  /// nem mexe em descrição, quantidade ou na observação de quem pediu. A
  /// mesma linha volta a ser cotável a qualquer momento, e pode virar item
  /// de uma ordem de compra emitida a outro fornecedor.
  async updateQuote(companyId: string, id: string, dto: UpdatePurchaseRequestQuoteDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'PENDING' && existing.status !== 'QUOTING') {
      throw new ConflictException(
        'Só é possível cotar solicitações aguardando aprovação ou em cotação.',
      );
    }

    // A QUANTIDADE vem do banco, não do DTO: ela é do solicitante e a cotação
    // não a toca. Também é metade da base de todo desconto — sem ela aqui, um
    // desconto em reais seria conferido contra um valor que não existe.
    const items = await this.prisma.purchaseRequestItem.findMany({
      where: { purchaseRequestId: id },
      select: { id: true, quantity: true },
    });
    const quantityById = new Map(items.map((item) => [item.id, item.quantity]));

    if (dto.items.some((item) => !quantityById.has(item.id))) {
      throw new BadRequestException('Um dos itens informados não pertence a esta solicitação.');
    }

    // Preço em item indisponível é contradição, não detalhe a ignorar: o
    // cliente está afirmando as duas coisas ao mesmo tempo, e escolher uma
    // em silêncio gravaria o oposto do que alguém quis.
    const contraditorio = dto.items.find(
      (item) => item.unavailable === true && item.estimatedUnitPrice !== undefined,
    );
    if (contraditorio) {
      throw new BadRequestException(
        'Item marcado como não disponível não pode ter valor unitário.',
      );
    }

    const cotados = dto.items.filter(
      (item) => item.unavailable !== true && item.estimatedUnitPrice !== undefined,
    );
    if (cotados.length === 0) {
      throw new BadRequestException(
        'Informe o valor de ao menos um item disponível. Uma cotação sem nenhum item cotado não tem o que aprovar.',
      );
    }

    // As linhas COMO FICARÃO depois deste patch. Os descontos precisam ser
    // conferidos contra a base que vão ter, não contra a que tinham: quem
    // baixa o preço unitário e mantém o desconto em reais está pedindo um
    // abatimento maior que a mercadoria, e isso só aparece somando os dois.
    const futuras = dto.items.map((item) => this.toQuoteItem(item, quantityById.get(item.id)!));
    this.assertDiscountsAreValid(futuras, dto);

    await this.prisma.$transaction([
      ...dto.items.map((item, index) => {
        const futura = futuras[index]!;
        return this.prisma.purchaseRequestItem.update({
          where: { id: item.id },
          data: {
            // Indisponível zera o preço em vez de manter o último cotado —
            // do contrário, alternar disponível → indisponível deixaria para
            // trás um valor que já não vale e continuaria no relatório.
            estimatedUnitPrice: futura.estimatedUnitPrice as Prisma.Decimal | null,
            unavailable: futura.unavailable,
            // A observação pertence ao estado indisponível; voltar a
            // disponível a leva junto.
            unavailabilityNote: futura.unavailable ? (item.unavailabilityNote ?? null) : null,
            discountType: futura.discountType,
            discountValue: futura.discountValue as number,
          },
        });
      }),
      // O desconto geral vive na solicitação — e é por isso que ele entra na
      // auditoria sozinho: `PurchaseRequest` já é um modelo auditado pela
      // extensão do Prisma (ver `common/prisma/audit-extension.ts`).
      this.prisma.purchaseRequest.update({
        where: { id, companyId },
        data: {
          discountType: dto.discount?.type ?? 'AMOUNT',
          discountValue: dto.discount?.value ?? 0,
        },
      }),
    ]);

    return this.findOne(companyId, id);
  }

  /// Uma linha do DTO traduzida para o formato da conta, com as regras de
  /// "quando o desconto pode existir" já aplicadas.
  ///
  /// Item indisponível ou sem preço perde o desconto: no primeiro caso a linha
  /// inteira está fora da cotação (regra C-16), no segundo não há base sobre a
  /// qual descontar. Guardar um desconto órfão significaria vê-lo reaparecer
  /// sozinho quando o item voltasse a ser cotado.
  private toQuoteItem(
    item: {
      estimatedUnitPrice?: number;
      unavailable?: boolean;
      discount?: { type: 'AMOUNT' | 'PERCENT'; value: number };
    },
    quantity: Prisma.Decimal,
  ): QuoteItem {
    const unavailable = item.unavailable === true;
    const estimatedUnitPrice = unavailable ? null : (item.estimatedUnitPrice ?? null);
    const temBase = !unavailable && estimatedUnitPrice !== null;

    return {
      quantity,
      estimatedUnitPrice,
      unavailable,
      discountType: temBase ? (item.discount?.type ?? 'AMOUNT') : 'AMOUNT',
      discountValue: temBase ? (item.discount?.value ?? 0) : 0,
    };
  }

  /// As validações de desconto que o DTO não tem como fazer sozinho, porque
  /// dependem da BASE — e a base depende de preço e quantidade.
  ///
  /// O DTO já barrou negativo e percentual acima de 100. O que sobra aqui é o
  /// desconto em reais maior do que aquilo sobre o que ele incide, nos dois
  /// níveis. Recusar em vez de aparar em silêncio: quem digitou R$ 1.500 num
  /// item de R$ 1.000 errou alguma coisa, e gravar R$ 1.000 esconderia o erro.
  private assertDiscountsAreValid(itens: QuoteItem[], dto: UpdatePurchaseRequestQuoteDto): void {
    itens.forEach((item, index) => {
      const enviado = dto.items[index]!;

      if (enviado.discount && !isQuoted(item)) {
        throw new BadRequestException(
          'Item sem valor unitário ou não disponível não pode receber desconto.',
        );
      }

      if (item.discountType === 'PERCENT' && Number(item.discountValue) > 100) {
        throw new BadRequestException('O desconto percentual não pode passar de 100%.');
      }

      const { gross } = calculateItemTotals(item);
      if (
        item.discountType === 'AMOUNT' &&
        new Prisma.Decimal(item.discountValue).greaterThan(gross)
      ) {
        throw new BadRequestException(
          'O desconto de um item não pode ser maior que o valor do próprio item.',
        );
      }
    });

    if (!dto.discount) return;

    if (dto.discount.type === 'PERCENT' && dto.discount.value > 100) {
      throw new BadRequestException('O desconto geral não pode passar de 100%.');
    }

    const { subtotalAfterItemDiscounts } = calculateQuoteTotals(itens, {
      type: 'AMOUNT',
      value: 0,
    });

    if (
      dto.discount.type === 'AMOUNT' &&
      new Prisma.Decimal(dto.discount.value).greaterThan(subtotalAfterItemDiscounts)
    ) {
      throw new BadRequestException(
        'O desconto geral não pode ser maior que o subtotal da cotação depois dos descontos dos itens.',
      );
    }
  }

  async updateStatus(
    companyId: string,
    id: string,
    targetStatus: PurchaseRequestStatus,
    permissions: string[] = [],
  ) {
    const existing = await this.assertExists(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Não é possível mudar de "${existing.status}" para "${targetStatus}".`,
      );
    }

    // Quem só tem `compras.request` (Engenharia) abre a solicitação e a manda
    // para Compras — e pode desistir enquanto ela ainda é rascunho. A partir
    // daí o processo é do setor de Compras: marcar em cotação, aprovar e
    // cancelar um pedido já enviado exigem `compras.manage`.
    if (!permissions.includes('compras.manage')) {
      const isRequesterTransition =
        existing.status === 'DRAFT' && REQUESTER_TRANSITIONS.includes(targetStatus);

      if (!isRequesterTransition) {
        throw new ForbiddenException(
          'Esta mudança de status é do setor de Compras. Você pode enviar ou cancelar a solicitação enquanto ela é um rascunho.',
        );
      }
    }

    // Alçada: só APROVAR é controlado por valor. Rascunho, envio e
    // cancelamento continuam livres para quem tem `compras.manage`.
    if (targetStatus === 'APPROVED') {
      const items = await this.prisma.purchaseRequestItem.findMany({
        where: { purchaseRequestId: id },
        select: {
          quantity: true,
          estimatedUnitPrice: true,
          unavailable: true,
          discountType: true,
          discountValue: true,
        },
      });

      // O valor da alçada é o TOTAL FINAL, depois do desconto de item e do
      // desconto geral: é o que a empresa vai efetivamente comprometer. Usar
      // o bruto exigiria aprovação acima da alçada para uma compra que, com
      // desconto, cabe nela. Nenhuma regra de aprovação nova — só o número
      // que ela já usava, agora correto.
      const { total } = calculateQuoteTotals(items, generalDiscountOf(existing));

      await this.approvalThreshold.assertWithinPurchaseThreshold(
        companyId,
        permissions,
        total.toNumber(),
      );
    }

    await this.prisma.purchaseRequest.update({
      where: { id, companyId },
      data: { status: targetStatus },
    });

    return this.findOne(companyId, id);
  }

  /// Gera o PDF da solicitação.
  ///
  /// SEGURANÇA: a cadeia inteira é alcançada a partir de UMA consulta já
  /// filtrada por `companyId` — itens, solicitante, obra e centro de custo vêm
  /// aninhados nela, não por ids vindos do cliente. Não existe caminho para
  /// montar um documento com dado de outra empresa: o id da URL que não for da
  /// empresa do token simplesmente não encontra solicitação nenhuma.
  ///
  /// NÃO muda o estado da solicitação: é leitura pura, e imprimir uma
  /// solicitação não é um evento do fluxo de aprovação.
  async generatePdf(companyId: string, id: string): Promise<RenderedPdf & { code: string }> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
      ...pdfArgs,
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    // A empresa vem do TOKEN, nunca da solicitação — mesmo sendo equivalente
    // aqui, depender do `companyId` autenticado mantém a regra a uma linha de
    // distância de qualquer refatoração futura.
    const company = await this.prisma.company.findFirstOrThrow({
      where: { id: companyId },
      select: COMPANY_HEADER_SELECT,
    });

    const rendered = await renderDocumentPdf(buildPurchaseRequestDocument(request, company));
    return { ...rendered, code: request.code };
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.purchaseRequest.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), code: mangleDeletedCode(existing.code, existing.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return request;
  }

  /// Valida o par obra + centro de custo que veio do formulário.
  ///
  /// Substituiu a antiga derivação (a obra saía do centro de custo). Agora os
  /// dois vêm do cliente, e é justamente por isso que a checagem de coerência
  /// precisa existir: nada no tipo impede alguém de enviar a obra A com um
  /// centro de custo da obra B, e o banco aceitaria — as duas FKs são válidas
  /// isoladamente. O erro só apareceria meses depois, num relatório que soma
  /// custo na obra errada.
  ///
  /// Centro de custo sem obra nenhuma (Escritório, Fazenda) é recusado aqui
  /// pelo mesmo motivo: ele não pertence à obra escolhida.
  private async assertObraECentroDeCusto(
    companyId: string,
    constructionSiteId: string,
    costCenterId?: string | null,
  ): Promise<void> {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!site) {
      throw new BadRequestException('Obra informada não existe.');
    }

    if (!costCenterId) return;

    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, companyId, deletedAt: null },
      select: { constructionSiteId: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    if (costCenter.constructionSiteId !== constructionSiteId) {
      throw new BadRequestException('O centro de custo não pertence à obra escolhida.');
    }
  }
}
