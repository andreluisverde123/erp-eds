import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../../common/audit-context';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { pendingOf } from '../fulfillment';
import { FulfillmentService } from '../fulfillment.service';
import {
  calculateOrderItemTotals,
  calculateOrderTotals,
  type Discount,
} from './purchase-order-totals';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { buildFinancialStatus, type PurchaseOrderFinancialStatus } from './financial-status.util';
import { renderDocumentPdf, type RenderedPdf } from '../../common/pdf/pdf-renderer';
import { COMPANY_HEADER_SELECT } from '../../common/pdf/printable-document';
import { buildPurchaseOrderDocument } from './pdf/purchase-order-document';
import { PurchaseOrderItemInputDto } from './dto/purchase-order-item-input.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const includeArgs = Prisma.validator<Prisma.PurchaseOrderDefaultArgs>()({
  include: {
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    purchaseRequest: { select: { id: true, code: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    /// Quem emitiu — é o nome impresso no campo de assinatura do PDF.
    createdBy: { select: { id: true, name: true } },
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
    /// Quem emitiu — assina o documento.
    createdBy: { select: { name: true } },
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

/// Quantidade como a mensagem de erro e o histórico devem mostrá-la: sem os
/// zeros à direita que o `Decimal(12,3)` carrega. "10" e não "10,000" — o
/// segundo faz a pessoa procurar uma casa decimal que ela nunca digitou.
function formatQuantity(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value)
    .toDecimalPlaces(3)
    .toNumber()
    .toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(companyId: string, createdById: string, dto: CreatePurchaseOrderDto) {
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

    const costCenterId = await this.resolveCostCenterId(
      companyId,
      request.constructionSiteId,
      request.costCenterId,
      dto.costCenterId,
    );

    // Resolve ANTES de criar a ordem: um item inválido tem de recusar a
    // requisição inteira, não deixar uma ordem sem linhas para trás.
    const items = await this.resolveItems(companyId, request.id, dto.items);
    const desconto: Discount = dto.discount ?? { type: 'AMOUNT', value: 0 };
    this.assertGeneralDiscountFits(items, desconto);

    // O SALDO é lido e consumido dentro da MESMA transação, depois de travar a
    // solicitação. Ver `assertWithinPending`: fora dela, dois compradores
    // olhando as mesmas 10 unidades pendentes comprariam 7 cada um.
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, request.id);
      await this.assertWithinPending(tx, request.id, items);

      // Numerado DENTRO do lock: duas ordens nascendo ao mesmo tempo contavam
      // o mesmo total e recebiam o mesmo código, e a unique de
      // `(empresa, código)` derrubava a segunda com erro de banco.
      const code = await nextSequentialCode(
        () => tx.purchaseOrder.count({ where: { companyId } }),
        'OC',
      );

      return tx.purchaseOrder.create({
        data: {
          companyId,
          purchaseRequestId: request.id,
          supplierId: dto.supplierId,
          constructionSiteId: request.constructionSiteId,
          costCenterId,
          code,
          createdById,
          discountType: desconto.type,
          discountValue: desconto.value,
          // DERIVADO dos itens e do desconto geral, nunca informado pelo
          // cliente — o campo saiu do DTO. Ver `calculateOrderTotals`.
          totalAmount: calculateOrderTotals(items, desconto).total,
          issueDate: new Date(dto.issueDate),
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : undefined,
          status: dto.status,
          // Aninhado, e não em duas chamadas: ordem e itens nascem juntos ou
          // não nascem.
          items: { create: items },
        },
      });
    });

    // Fora da transação de propósito: a auditoria não pode derrubar a compra.
    // Uma ordem emitida e um log perdido é ruim; uma ordem recusada porque o
    // log falhou é pior.
    await this.logFulfillment(companyId, request.id, created, items);

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
  /// O desconto geral não pode passar do subtotal já líquido dos itens.
  ///
  /// Mesma regra da cotação, e pelo mesmo motivo: o clamp de `resolveDiscount`
  /// impediria o total negativo, mas em silêncio — o comprador digitaria 500 de
  /// desconto num subtotal de 300 e veria zero, sem entender por quê.
  private assertGeneralDiscountFits(
    items: { quantity: number; unitPrice: number; discountType: 'AMOUNT' | 'PERCENT'; discountValue: number }[],
    desconto: Discount,
  ): void {
    if (desconto.type === 'PERCENT') {
      if (Number(desconto.value) > 100) {
        throw new BadRequestException('O desconto geral não pode passar de 100%.');
      }
      return;
    }

    const { subtotalAfterItemDiscounts } = calculateOrderTotals(items, { type: 'AMOUNT', value: 0 });
    if (new Prisma.Decimal(desconto.value).greaterThan(subtotalAfterItemDiscounts)) {
      throw new BadRequestException(
        'O desconto geral não pode ser maior que o subtotal da ordem depois dos descontos dos itens.',
      );
    }
  }

  /// TRAVA a solicitação até o fim da transação.
  ///
  /// É o que impede a corrida da compra parcial: dois compradores abrem a
  /// mesma solicitação com 10 unidades pendentes, cada um pede 7, e sem lock
  /// os dois leem "10 pendentes" antes de qualquer um gravar — o banco aceita
  /// as duas ordens e a obra compra 14 do que precisava de 10.
  ///
  /// Lock PESSIMISTA e na LINHA DA SOLICITAÇÃO, e não isolamento
  /// `Serializable`: a solicitação é o documento-mãe e o ponto por onde toda
  /// ordem dela passa, então travá-la serializa exatamente as operações
  /// concorrentes e nada mais. `Serializable` valeria para o banco inteiro e
  /// devolveria erro de serialização para o usuário conferir sozinho.
  ///
  /// `FOR UPDATE` sem `NOWAIT`: o segundo comprador ESPERA o primeiro terminar
  /// e então lê o saldo já atualizado — que é como ele descobre que restam 3,
  /// e não 10. Falhar na hora só transferiria o problema para a tela.
  private async lockRequest(tx: Prisma.TransactionClient, purchaseRequestId: string) {
    await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${purchaseRequestId}::uuid FOR UPDATE`;
  }

  /// Recusa a ordem que compraria mais do que ainda falta.
  ///
  /// A regra é uma só, e é a razão de existir desta etapa:
  ///
  ///     Σ(quantidades compradas em todas as ordens) ≤ quantidade solicitada
  ///
  /// Conferida por LINHA, nunca pelo documento: comprar 100 sacos de cimento e
  /// zero latas de tinta numa solicitação de 100 + 10 não pode passar só
  /// porque o total de unidades fecha.
  ///
  /// PRECISA rodar dentro da transação que já travou a solicitação — o
  /// parâmetro `tx` não é conveniência, é a condição de a conta valer.
  private async assertWithinPending(
    tx: Prisma.TransactionClient,
    purchaseRequestId: string,
    items: { purchaseRequestItemId: string; description: string; quantity: number }[],
    excludePurchaseOrderId?: string,
  ): Promise<void> {
    const comprado = await this.fulfillment.entriesByItem(purchaseRequestId, {
      excludePurchaseOrderId,
      client: tx,
    });

    const solicitados = await tx.purchaseRequestItem.findMany({
      where: { purchaseRequestId },
      select: { id: true, quantity: true, unit: true },
    });
    const origemPorId = new Map(solicitados.map((item) => [item.id, item]));

    for (const item of items) {
      const origem = origemPorId.get(item.purchaseRequestItemId);
      // `resolveItems` já garantiu a procedência de cada linha; isto é a rede
      // para quem chamar este método de outro lugar no futuro.
      if (!origem) continue;

      const jaComprado = (comprado.get(item.purchaseRequestItemId) ?? []).reduce(
        (total, entrada) => total.plus(entrada.quantity),
        new Prisma.Decimal(0),
      );
      const pendente = pendingOf(origem.quantity, jaComprado);

      if (new Prisma.Decimal(item.quantity).greaterThan(pendente)) {
        // A mensagem abre a conta inteira: sem os três números, quem recebe
        // "quantidade inválida" não tem como saber quanto pode comprar.
        throw new BadRequestException(
          pendente.isZero()
            ? `O item "${item.description}" já foi totalmente comprado (${formatQuantity(origem.quantity)} ${origem.unit}). Não há saldo pendente.`
            : `O item "${item.description}" tem apenas ${formatQuantity(pendente)} ${origem.unit} em aberto (${formatQuantity(jaComprado)} de ${formatQuantity(origem.quantity)} já comprados). Você tentou comprar ${formatQuantity(item.quantity)}.`,
        );
      }
    }
  }

  /// Registra na SOLICITAÇÃO que uma ordem atendeu parte dela.
  ///
  /// `entityType` é `PurchaseRequest`, e não `PurchaseOrder`, de propósito: a
  /// pergunta que este log responde ("quem comprou o quê, e quanto ainda
  /// falta?") é feita na tela da solicitação, e é lá que o painel de histórico
  /// consulta. A ordem já tem o log próprio da extensão genérica do Prisma.
  ///
  /// Mesmo padrão — e mesmos motivos — de `logDiscountChanges` na solicitação:
  /// uma entrada por evento, com a descrição do item no VALOR e nunca na
  /// chave (o painel insere espaço antes de cada maiúscula do nome do campo, e
  /// "Cimento CP-II" viraria " Cimento  C P- I I").
  private async logFulfillment(
    companyId: string,
    purchaseRequestId: string,
    order: { id: string; code: string },
    items: { purchaseRequestItemId: string; description: string; quantity: number }[],
  ): Promise<void> {
    const store = auditContextStorage.getStore();

    try {
      const solicitados = await this.prisma.purchaseRequestItem.findMany({
        where: { purchaseRequestId },
        select: { id: true, quantity: true, unit: true },
      });
      const origemPorId = new Map(solicitados.map((item) => [item.id, item]));

      // Lido DEPOIS do commit: é o saldo que passou a valer, que é o que
      // interessa a quem abre o histórico.
      const comprado = await this.fulfillment.entriesByItem(purchaseRequestId);

      const comprados: string[] = [];
      const restantes: string[] = [];

      for (const item of items) {
        const origem = origemPorId.get(item.purchaseRequestItemId);
        if (!origem) continue;

        const total = (comprado.get(item.purchaseRequestItemId) ?? []).reduce(
          (soma, entrada) => soma.plus(entrada.quantity),
          new Prisma.Decimal(0),
        );
        const pendente = pendingOf(origem.quantity, total);

        comprados.push(`${item.description}: ${formatQuantity(item.quantity)} ${origem.unit}`);
        restantes.push(
          `${item.description}: ${formatQuantity(total)} de ${formatQuantity(origem.quantity)}${
            pendente.isZero() ? ' (atendido)' : ` (faltam ${formatQuantity(pendente)})`
          }`,
        );
      }

      await this.auditLogger.log({
        companyId,
        userId: store?.userId,
        action: 'UPDATE',
        entityType: 'PurchaseRequest',
        entityId: purchaseRequestId,
        changes: {
          ordemGerada: { from: '—', to: order.code },
          itensComprados: { from: '—', to: comprados.join(' · ') },
          atendimentoDaSolicitacao: { from: '—', to: restantes.join(' · ') },
        },
      });
    } catch {
      // A compra já está gravada. Derrubar a resposta agora faria o comprador
      // reemitir uma ordem que existe — e aí sim o saldo ficaria errado.
    }
  }

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
      const desconto = item.discount ?? { type: 'AMOUNT' as const, value: 0 };
      const { gross, net } = calculateOrderItemTotals({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: desconto.type,
        discountValue: desconto.value,
      });

      // Recusa ANTES de gravar, com mensagem — o clamp de `resolveDiscount` é
      // rede de segurança, não validação. Sem isto, um desconto maior que a
      // linha seria silenciosamente reduzido e o comprador veria um total que
      // não corresponde ao que digitou.
      if (desconto.type === 'PERCENT' && desconto.value > 100) {
        throw new BadRequestException('O desconto de um item não pode passar de 100%.');
      }
      if (desconto.type === 'AMOUNT' && new Prisma.Decimal(desconto.value).greaterThan(gross)) {
        throw new BadRequestException(
          `O desconto do item "${source.description}" não pode ser maior que o valor do próprio item.`,
        );
      }

      return {
        purchaseRequestItemId: source.id,
        description: source.description,
        unit: source.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: desconto.type,
        discountValue: desconto.value,
        totalPrice: net,
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
      // Mesma trava da criação, e pelo mesmo motivo: editar a quantidade de
      // uma ordem consome saldo tanto quanto emitir uma nova.
      if (items) {
        await this.lockRequest(tx, existing.purchaseRequestId);
        // `excludePurchaseOrderId` é o detalhe que faz a edição funcionar: as
        // linhas DESTA ordem não podem contar como já compradas contra ela
        // mesma, senão trocar 40 por 41 seria recusado pelos 40 que ela já
        // consome.
        await this.assertWithinPending(tx, existing.purchaseRequestId, items, id);
      }

      await tx.purchaseOrder.update({
        where: { id, companyId },
        data: {
          supplierId: dto.supplierId,
          // Recalculado SÓ quando a lista de itens veio junto. Editar apenas a
          // data de uma ordem antiga (emitida antes de existirem itens) não
          // pode zerar o valor dela — ver a nota sobre ordens legadas em
          // `docs/plano-evolucoes.md`.
          discountType: dto.discount?.type,
          discountValue: dto.discount?.value,
          totalAmount: items
            ? calculateOrderTotals(items, dto.discount ?? { type: 'AMOUNT', value: 0 }).total
            : undefined,
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
      select: COMPANY_HEADER_SELECT,
    });

    const rendered = await renderDocumentPdf(buildPurchaseOrderDocument(order, company));
    return { ...rendered, code: order.code };
  }

  /// CANCELA a ordem: ela continua existindo, marcada como cancelada.
  ///
  /// É a ação para "a compra não vai mais acontecer". O documento fica na
  /// lista, com o histórico, porque o fornecedor recebeu um pedido e precisa
  /// haver registro de que ele foi desfeito.
  ///
  /// Recusada quando já existe pagamento efetuado: dinheiro que saiu não se
  /// desfaz cancelando o pedido, e deixar cancelar criaria uma ordem cancelada
  /// com conta paga — um estado que nenhum relatório sabe explicar.
  async cancel(companyId: string, id: string) {
    const order = await this.assertExists(companyId, id);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Esta ordem de compra já está cancelada.');
    }

    const pagas = await this.prisma.accountPayable.count({
      where: {
        deletedAt: null,
        status: { in: ['PAID', 'PARTIAL'] },
        invoice: { purchaseOrderId: id },
      },
    });

    if (pagas > 0) {
      throw new BadRequestException(
        'Esta ordem já tem pagamento efetuado e não pode ser cancelada. Trate a devolução pelo Financeiro.',
      );
    }

    await this.prisma.purchaseOrder.update({
      where: { id, companyId },
      data: { status: 'CANCELLED' },
    });

    return this.findOne(companyId, id);
  }

  /// EXCLUI a ordem — para o caso de ter sido gerada por engano.
  ///
  /// Diferente de cancelar: aqui a ordem some da lista, como se não tivesse
  /// existido. Por isso só é permitida enquanto NADA depende dela.
  ///
  /// Sem esta verificação, excluir uma ordem que já tem nota conciliada
  /// deixaria a fatura e a conta a pagar apontando para um documento que
  /// sumiu — e ninguém relacionaria o buraco no relatório com este clique.
  /// Quem quer desfazer uma compra que já andou usa CANCELAR.
  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.assertExists(companyId, id);

    const [faturas, notas] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where: { purchaseOrderId: id, deletedAt: null } }),
      this.prisma.inboundInvoice.count({ where: { purchaseOrderId: id } }),
    ]);

    if (faturas > 0 || notas > 0) {
      throw new BadRequestException(
        'Esta ordem já tem nota fiscal vinculada e não pode ser excluída. Cancele-a se a compra não vai mais acontecer.',
      );
    }

    // Soft delete com o código embaralhado: a unique de `(empresa, código)`
    // não ignora `deletedAt`, então sem isso o número da ordem excluída
    // bloquearia para sempre — e a sequência não reaproveita números.
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

  /// Decide o centro de custo da ordem, que é obrigatório mesmo quando a
  /// solicitação não tinha nenhum.
  ///
  /// A solicitação passou a exigir só a obra: quem pede material sabe para
  /// onde vai, e não necessariamente em que conta entra. Compras fecha essa
  /// lacuna aqui, na emissão — o mesmo lugar onde já resolve o preço que o
  /// solicitante não informou.
  ///
  /// O informado na emissão tem precedência sobre o da solicitação: Compras
  /// enxerga a nota do fornecedor e a natureza real da despesa, e pode
  /// corrigir uma atribuição que o solicitante chutou.
  private async resolveCostCenterId(
    companyId: string,
    constructionSiteId: string,
    doPedido: string | null,
    informado?: string,
  ): Promise<string | null> {
    const escolhido = informado ?? doPedido;

    // Sem centro de custo em lugar nenhum, a ordem sai sem ele — como a
    // solicitação que a originou, e como a fatura e a conta a pagar que virão
    // depois. Recusar aqui obrigava Compras a inventar uma atribuição de custo
    // só para conseguir emitir, e uma atribuição inventada é pior que a
    // ausência: ela entra nos relatórios como se fosse verdade.
    if (!escolhido) return null;

    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: escolhido, companyId, deletedAt: null },
      select: { constructionSiteId: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    // Mesma coerência exigida na solicitação: a ordem herda a obra dela, então
    // um centro de custo de outra obra somaria custo no lugar errado.
    if (costCenter.constructionSiteId !== constructionSiteId) {
      throw new BadRequestException('O centro de custo não pertence à obra da solicitação.');
    }

    return escolhido;
  }
}
