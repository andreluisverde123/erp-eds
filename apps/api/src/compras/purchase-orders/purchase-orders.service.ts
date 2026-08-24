import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { buildFinancialStatus, type PurchaseOrderFinancialStatus } from './financial-status.util';
import { buildPurchaseOrderDocument } from './pdf/purchase-order-document';
import { renderPurchaseOrderPdf, type RenderedPdf } from './pdf/purchase-order-pdf';
import { PurchaseOrderItemInputDto } from './dto/purchase-order-item-input.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const includeArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
  include: {
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    purchaseRequest: { select: { id: true, code: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    items: {
      // A ordem das linhas é a da solicitação, não a de inserção: é assim que
      // o comprador confere o pedido contra o que foi pedido.
      orderBy: { createdAt: 'asc' },
      include: {
        /// A ORIGEM viaja junto da linha. Sem isto a tela teria o vínculo mas
        /// não teria como mostrá-lo, e "rastreável" só valeria via API.
        purchaseRequestItem: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unit: true,
            estimatedUnitPrice: true,
            purchaseRequest: { select: { id: true, code: true } },
          },
        },
      },
    },
  },
});

/// O PDF precisa de mais do que a tela: endereço e contato do fornecedor, as
/// observações da solicitação e a unidade original de cada item. Um include
/// separado em vez de engordar o `includeArgs` — a listagem paginada não deve
/// pagar por colunas que só o documento usa.
type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<typeof includeArgs>;

const pdfArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
  include: {
    supplier: true,
    purchaseRequest: { select: { code: true, notes: true } },
    constructionSite: { select: { code: true, name: true } },
    costCenter: { select: { code: true, name: true } },
    items: {
      orderBy: { createdAt: 'asc' },
      include: {
        purchaseRequestItem: {
          select: {
            quantity: true,
            unit: true,
            purchaseRequest: { select: { code: true } },
          },
        },
      },
    },
  },
});

/// `quantity × unitPrice`, arredondado a 2 casas.
///
/// Em `Prisma.Decimal` e não em `number`: quantidade tem 3 casas e preço tem
/// 2, então o produto pode ter 5 — e `0.1 * 3` em ponto flutuante devolve
/// `0.30000000000000004`. Num campo de dinheiro isso vira centavo errado.
///
/// HALF_UP é o arredondamento comercial esperado no Brasil (0,005 sobe), e é
/// o mesmo que o Postgres aplica ao gravar em `DECIMAL(14,2)` — arredondar
/// aqui só garante que o valor conferido pelo backend é idêntico ao gravado.
export function calculateItemTotal(quantity: number, unitPrice: number): Prisma.Decimal {
  return new Prisma.Decimal(quantity)
    .times(unitPrice)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/// O total da ordem: soma dos totais das linhas.
///
/// Soma os totais JÁ ARREDONDADOS de cada item, e não o produto bruto de cada
/// um. É a diferença entre o total bater com a coluna que o usuário lê e ele
/// divergir por centavos de algo que ninguém consegue conferir na tela — o
/// número impresso no PDF tem de ser a soma exata do que está impresso acima
/// dele.
export function sumItemTotals(items: { totalPrice: Prisma.Decimal }[]): Prisma.Decimal {
  return items.reduce((total, item) => total.plus(item.totalPrice), new Prisma.Decimal(0));
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreatePurchaseOrderDto) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id: dto.purchaseRequestId, companyId, deletedAt: null },
      select: { id: true, status: true, constructionSiteId: true, costCenterId: true },
    });

    if (!request) {
      throw new BadRequestException('Solicitação informada não existe.');
    }
    if (request.status !== 'APPROVED') {
      throw new BadRequestException(
        'Só é possível gerar ordem de compra a partir de uma solicitação aprovada.',
      );
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) {
      throw new BadRequestException('Fornecedor informado não existe.');
    }

    const code = await nextSequentialCode(
      () => this.prisma.purchaseOrder.count({ where: { companyId } }),
      'OC',
    );

    // Resolve ANTES de criar a ordem: um item inválido tem de recusar a
    // requisição inteira, não deixar uma ordem sem linhas para trás.
    const items = await this.resolveItems(companyId, request.id, dto.items);

    const created = await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        purchaseRequestId: request.id,
        supplierId: dto.supplierId,
        constructionSiteId: request.constructionSiteId,
        costCenterId: request.costCenterId,
        code,
        // DERIVADO dos itens, nunca informado pelo cliente — o campo saiu do
        // DTO. Ver `sumItemTotals`.
        totalAmount: sumItemTotals(items),
        issueDate: new Date(dto.issueDate),
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : undefined,
        status: dto.status,
        // Aninhado, e não em duas chamadas: ordem e itens nascem juntos ou
        // não nascem — o Prisma envolve o create aninhado numa transação.
        items: { create: items },
      },
    });

    return this.findOne(companyId, created.id);
  }

  /// Converte as linhas enviadas pelo cliente nas linhas que vão para o banco.
  ///
  /// Faz três coisas que o DTO não tem como fazer sozinho:
  ///
  ///  1. CONFERE A ORIGEM. Cada `purchaseRequestItemId` precisa pertencer à
  ///     solicitação DESTA ordem — o filtro atravessa a relação até o
  ///     `companyId`, então item de outra empresa (ou de outra solicitação da
  ///     mesma empresa) simplesmente não casa. É aqui que o isolamento
  ///     multi-tenant do vínculo por item acontece.
  ///  2. COPIA descrição e unidade da linha de origem, em vez de aceitá-las
  ///     do cliente.
  ///  3. CALCULA `totalPrice`. Ver `calculateItemTotal`.
  private async resolveItems(
    companyId: string,
    purchaseRequestId: string,
    items: PurchaseOrderItemInputDto[],
  ) {
    const ids = items.map((item) => item.purchaseRequestItemId);

    // A unique do banco também barraria, mas com um 500 feio; aqui a mensagem
    // diz o que houve. Duas linhas da ordem para o MESMO item da solicitação
    // seriam duplicata, não compra parcial.
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'O mesmo item da solicitação foi enviado mais de uma vez na ordem.',
      );
    }

    const sources = await this.prisma.purchaseRequestItem.findMany({
      where: {
        id: { in: ids },
        purchaseRequest: { id: purchaseRequestId, companyId, deletedAt: null },
      },
      select: { id: true, description: true, unit: true },
    });
    const byId = new Map(sources.map((source) => [source.id, source]));

    // Mensagem única para "não existe" e "é de outra empresa/solicitação", de
    // propósito: distinguir os dois contaria a quem tenta se o id existe em
    // algum outro tenant.
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Item da solicitação não encontrado nesta solicitação: ${missing.join(', ')}.`,
      );
    }

    return items.map((item) => {
      const source = byId.get(item.purchaseRequestItemId)!;
      return {
        purchaseRequestItemId: source.id,
        description: source.description,
        unit: source.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: calculateItemTotal(item.quantity, item.unitPrice),
        notes: item.notes,
      };
    });
  }

  async findAll(
    companyId: string,
    query: QueryPurchaseOrderDto,
  ): Promise<
    PaginatedResult<PurchaseOrderRow & { financialStatus: PurchaseOrderFinancialStatus }>
  > {
    const { page, limit, search, status, supplierId, purchaseRequestId } = query;

    const where: Prisma.PurchaseOrderWhereInput = {
      companyId,
      deletedAt: null,
      status,
      supplierId,
      purchaseRequestId,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        ...includeArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(await this.withFinancialStatus(companyId, data), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
    });

    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }

    const [comStatus] = await this.withFinancialStatus(companyId, [order]);
    return comStatus!;
  }

  /// Anexa a situação financeira derivada às ordens de UMA PÁGINA.
  ///
  /// Duas consultas para a página inteira, não duas por linha: o `in` recebe
  /// todos os ids de uma vez. Era esse o motivo de não colocar as notas e as
  /// parcelas no `includeArgs` — o include cresceria também para a geração de
  /// PDF e para o `update`, que não precisam disso.
  ///
  /// `companyId` entra nas duas consultas mesmo os ids já tendo saído de uma
  /// busca escopada: é a garantia que não depende de o chamador ter feito a
  /// coisa certa antes.
  private async withFinancialStatus<T extends { id: string }>(
    companyId: string,
    orders: T[],
  ): Promise<(T & { financialStatus: PurchaseOrderFinancialStatus })[]> {
    if (orders.length === 0) return [];

    const orderIds = orders.map((order) => order.id);

    const [invoices, inboundInvoices] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { companyId, deletedAt: null, purchaseOrderId: { in: orderIds } },
        select: {
          id: true,
          purchaseOrderId: true,
          number: true,
          series: true,
          status: true,
          accountsPayable: { where: { deletedAt: null }, select: { status: true } },
        },
      }),
      this.prisma.inboundInvoice.findMany({
        where: { companyId, purchaseOrderId: { in: orderIds } },
        select: {
          id: true,
          purchaseOrderId: true,
          number: true,
          series: true,
          status: true,
          reconciledAt: true,
        },
      }),
    ]);

    return orders.map((order) => ({
      ...order,
      financialStatus: buildFinancialStatus(
        invoices.filter((invoice) => invoice.purchaseOrderId === order.id),
        inboundInvoices.filter((nota) => nota.purchaseOrderId === order.id),
      ),
    }));
  }

  async update(companyId: string, id: string, dto: UpdatePurchaseOrderDto) {
    const existing = await this.assertExists(companyId, id);

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('Fornecedor informado não existe.');
      }
    }

    // A origem continua sendo a solicitação da ordem: `purchaseRequestId` não
    // é editável (ver o DTO), então os itens novos são conferidos contra a
    // mesma solicitação de sempre.
    const items = dto.items
      ? await this.resolveItems(companyId, existing.purchaseRequestId, dto.items)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id, companyId },
        data: {
          supplierId: dto.supplierId,
          // Recalculado SÓ quando a lista de itens veio junto. Editar apenas a
          // data de uma ordem antiga (emitida antes de existirem itens) não
          // pode zerar o valor dela — ver a nota sobre ordens legadas em
          // `docs/plano-evolucoes.md`.
          totalAmount: items ? sumItemTotals(items) : undefined,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : undefined,
          status: dto.status,
        },
      });

      // SUBSTITUI, não acrescenta: reenviar a mesma lista tem de deixar a
      // ordem igual, e não com as linhas em dobro. Mesma escolha que a
      // solicitação já faz ao editar os itens dela.
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: items.map((item) => ({ ...item, purchaseOrderId: id })),
        });
      }
    });

    return this.findOne(companyId, id);
  }

  /// Gera o PDF da ordem.
  ///
  /// SEGURANÇA: a cadeia inteira é alcançada a partir de UMA consulta já
  /// filtrada por `companyId` — itens, solicitação, obra, centro de custo e
  /// fornecedor vêm aninhados nela, não por ids vindos do cliente. Não existe
  /// caminho para montar um documento com dado de outra empresa: o id da URL
  /// que não for da empresa do token simplesmente não encontra ordem nenhuma.
  async generatePdf(companyId: string, id: string): Promise<RenderedPdf & { code: string }> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
      ...pdfArgs,
    });

    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }

    // A empresa vem do TOKEN, nunca da ordem — mesmo sendo equivalente aqui,
    // depender do `companyId` autenticado mantém a regra a uma linha de
    // distância de qualquer refatoração futura.
    const company = await this.prisma.company.findFirstOrThrow({
      where: { id: companyId },
      select: {
        legalName: true,
        tradeName: true,
        cnpj: true,
        stateRegistration: true,
        email: true,
        phone: true,
        addressLine: true,
        addressNumber: true,
        addressComplement: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });

    const rendered = await renderPurchaseOrderPdf(buildPurchaseOrderDocument(order, company));
    return { ...rendered, code: order.code };
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);
    await this.prisma.purchaseOrder.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), code: mangleDeletedCode(existing.code, existing.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException('Ordem de compra não encontrada.');
    }
    return order;
  }
}
