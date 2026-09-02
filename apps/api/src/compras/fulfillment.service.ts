import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateFulfillment,
  buildItemFulfillment,
  type FulfillmentEntry,
  type ItemFulfillment,
  type RequestFulfillment,
} from './fulfillment';

/// Aceita tanto o `PrismaService` quanto o `tx` de dentro de um
/// `$transaction`. É o que permite a MESMA leitura de saldo servir à tela (sem
/// transação) e à validação da ordem de compra (dentro dela, depois do lock) —
/// duas leituras diferentes seriam duas regras diferentes.
type PrismaLike = Prisma.TransactionClient;

/// ORDENS QUE CONTAM para o atendimento.
///
/// Cancelada NÃO conta: cancelar é dizer "esta compra não vai acontecer", e a
/// quantidade dela volta a ser comprável — é exatamente o caso de a Loja A
/// cancelar o pedido e a obra precisar comprar na Loja B. Excluída (soft
/// delete) também não: ela sumiu da vida do sistema.
const ORDENS_QUE_CONTAM = {
  status: { not: 'CANCELLED' as const },
  deletedAt: null,
};

/// A leitura do atendimento — o lado do banco da conta que vive em
/// `fulfillment.ts`.
///
/// Nenhum número aqui é gravado: tudo sai de `PurchaseOrderItem`, somando as
/// compras que apontam para cada linha pedida.
@Injectable()
export class FulfillmentService {
  constructor(private readonly prisma: PrismaService) {}

  /// As compras que atenderam cada linha de UMA solicitação.
  ///
  /// `excludePurchaseOrderId` existe para a EDIÇÃO de ordem: ao conferir o
  /// saldo de uma ordem que já existe, as linhas dela própria não podem contar
  /// como já compradas — senão trocar 40 por 41 seria recusado por causa dos
  /// 40 que a própria ordem consome.
  async entriesByItem(
    purchaseRequestId: string,
    options: { excludePurchaseOrderId?: string; client?: PrismaLike } = {},
  ): Promise<Map<string, FulfillmentEntry[]>> {
    const client = options.client ?? this.prisma;

    const rows = await client.purchaseOrderItem.findMany({
      where: {
        purchaseRequestItem: { purchaseRequestId },
        purchaseOrderId: options.excludePurchaseOrderId
          ? { not: options.excludePurchaseOrderId }
          : undefined,
        purchaseOrder: ORDENS_QUE_CONTAM,
      },
      select: {
        purchaseRequestItemId: true,
        quantity: true,
        purchaseOrder: {
          select: {
            id: true,
            code: true,
            createdAt: true,
            supplier: { select: { legalName: true, tradeName: true } },
          },
        },
      },
      // Na ordem em que as compras aconteceram: o histórico da linha lê-se de
      // cima para baixo, da primeira ordem à última.
      orderBy: { purchaseOrder: { createdAt: 'asc' } },
    });

    const porItem = new Map<string, FulfillmentEntry[]>();
    for (const row of rows) {
      const lista = porItem.get(row.purchaseRequestItemId) ?? [];
      lista.push({
        purchaseOrderId: row.purchaseOrder.id,
        purchaseOrderCode: row.purchaseOrder.code,
        // O nome fantasia é como a obra chama a loja; a razão social é o
        // que sempre existe. Mesma precedência da lista de ordens.
        supplierName: row.purchaseOrder.supplier.tradeName ?? row.purchaseOrder.supplier.legalName,
        quantity: row.quantity,
      });
      porItem.set(row.purchaseRequestItemId, lista);
    }

    return porItem;
  }

  /// O atendimento de cada linha de uma solicitação, pronto para a tela.
  async byItem(
    purchaseRequestId: string,
    items: { id: string; quantity: Prisma.Decimal }[],
  ): Promise<Map<string, ItemFulfillment>> {
    const entries = await this.entriesByItem(purchaseRequestId);

    return new Map(
      items.map((item) => [
        item.id,
        buildItemFulfillment(item.quantity, entries.get(item.id) ?? []),
      ]),
    );
  }

  /// O resumo de VÁRIAS solicitações de uma vez — para a listagem.
  ///
  /// Um `groupBy` para a página inteira, e não uma consulta por linha: o
  /// mesmo cuidado que `withFinancialStatus` já toma nas ordens de compra. A
  /// listagem não precisa do histórico item a item, só do agregado.
  async summaryByRequest(
    requests: { id: string; items: { id: string; quantity: Prisma.Decimal }[] }[],
  ): Promise<Map<string, RequestFulfillment>> {
    const itemIds = requests.flatMap((request) => request.items.map((item) => item.id));
    if (itemIds.length === 0) {
      return new Map(requests.map((request) => [request.id, aggregateFulfillment([])]));
    }

    const somas = await this.prisma.purchaseOrderItem.groupBy({
      by: ['purchaseRequestItemId'],
      where: {
        purchaseRequestItemId: { in: itemIds },
        purchaseOrder: ORDENS_QUE_CONTAM,
      },
      _sum: { quantity: true },
    });

    const compradoPorItem = new Map(
      somas.map((soma) => [
        soma.purchaseRequestItemId,
        soma._sum.quantity ?? new Prisma.Decimal(0),
      ]),
    );

    return new Map(
      requests.map((request) => [
        request.id,
        aggregateFulfillment(
          request.items.map((item) =>
            buildItemFulfillment(item.quantity, [
              // O agregado só precisa do TOTAL comprado; o histórico por
              // fornecedor é da tela de detalhe. Uma entrada sintética evita
              // uma segunda forma de construir `ItemFulfillment`.
              {
                purchaseOrderId: '',
                purchaseOrderCode: '',
                supplierName: '',
                quantity: compradoPorItem.get(item.id) ?? new Prisma.Decimal(0),
              },
            ]),
          ),
        ),
      ]),
    );
  }
}
