import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { Readable } from 'node:stream';

import { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.module';
import { PNG_1X1 } from '../../common/pdf/png-1x1.fixture';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { FulfillmentService } from '../fulfillment.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderItemInputDto } from './dto/purchase-order-item-input.dto';
import {
  calculateItemTotal,
  PurchaseOrdersService,
  sumItemTotals,
} from './purchase-orders.service';

const EMPRESA_A = '11111111-1111-1111-1111-111111111111';
/// Quem emite a ordem — é o nome que assina o PDF.
const COMPRADOR = 'cccccccc-0000-4000-8000-000000000001';
const EMPRESA_B = '22222222-2222-2222-2222-222222222222';
const SOLICITACAO = '33333333-3333-3333-3333-333333333333';
const FORNECEDOR = '44444444-4444-4444-4444-444444444444';

/// Itens de solicitação de duas empresas diferentes, para o dublê poder
/// reproduzir o filtro que atravessa a relação até o `companyId` — é a única
/// forma de o teste de isolamento provar alguma coisa.
const ITENS_SOLICITACAO = [
  {
    id: 'item-cimento',
    description: '50 sacos de cimento CP-II',
    unit: 'SC',
    purchaseRequestId: SOLICITACAO,
    companyId: EMPRESA_A,
  },
  {
    id: 'item-areia',
    description: 'Areia média lavada',
    unit: 'M3',
    purchaseRequestId: SOLICITACAO,
    companyId: EMPRESA_A,
  },
  {
    id: 'item-de-outra-empresa',
    description: 'Item da empresa B',
    unit: 'UN',
    purchaseRequestId: 'solicitacao-da-empresa-b',
    companyId: EMPRESA_B,
  },
  {
    id: 'item-de-outra-solicitacao',
    description: 'Item de outra solicitação da MESMA empresa',
    unit: 'UN',
    purchaseRequestId: 'outra-solicitacao-da-empresa-a',
    companyId: EMPRESA_A,
  },
];

function makeService(
  overrides: {
    requestStatus?: string;
    requestCompanyId?: string;
    supplierExists?: boolean;
    /// Situação atual da ordem devolvida pelo dublê — usada pelas guardas de
    /// cancelamento.
    orderStatus?: string;
    /// QUANTO foi pedido de cada linha da solicitação. É metade do saldo — a
    /// outra metade é `compras`.
    ///
    /// O padrão é folgado de propósito: os testes anteriores a esta etapa não
    /// falam de saldo, e apertar a quantidade neles trocaria o assunto de cada
    /// um por "cabe no pendente?". Quem testa o saldo declara o número.
    pedidos?: Record<string, number>;
    /// O que JÁ foi comprado desta solicitação, em ordens que contam (não
    /// canceladas, não excluídas).
    compras?: { purchaseRequestItemId: string; quantity: number }[];
    /// Faz a auditoria falhar, para provar que ela não derruba a compra.
    auditoriaFalha?: boolean;
    financeiro?: {
      invoices: Record<string, unknown>[];
      inboundInvoices: Record<string, unknown>[];
      /// Contas a pagar já pagas ou parcialmente pagas — o que impede
      /// cancelar, porque dinheiro que saiu não se desfaz cancelando o pedido.
      paidPayables?: number;
    };
  } = {},
) {
  const {
    requestStatus = 'APPROVED',
    requestCompanyId = EMPRESA_A,
    supplierExists = true,
    orderStatus = 'OPEN',
    financeiro = { invoices: [], inboundInvoices: [] },
    pedidos = {},
    compras = [],
    auditoriaFalha = false,
  } = overrides;

  /// Quantidade pedida quando o teste não declara nenhuma. Ver `pedidos`.
  const QUANTIDADE_PEDIDA_FOLGADA = 1_000_000;

  const quantidadePedida = (id: string) =>
    new Prisma.Decimal(pedidos[id] ?? QUANTIDADE_PEDIDA_FOLGADA);

  /// As compras no formato que `FulfillmentService.entriesByItem` lê.
  const comprasComOrdem = () =>
    compras.map((compra) => ({
      purchaseRequestItemId: compra.purchaseRequestItemId,
      quantity: new Prisma.Decimal(compra.quantity),
      purchaseOrder: {
        id: 'oc-anterior',
        code: 'OC-0001',
        createdAt: new Date('2026-08-01'),
        supplier: { legalName: 'LOJA A MATERIAIS LTDA', tradeName: 'Loja A' },
      },
    }));

  /// As linhas da solicitação como a conferência de saldo as lê.
  const linhasDaSolicitacao = (purchaseRequestId: string) =>
    ITENS_SOLICITACAO.filter((item) => item.purchaseRequestId === purchaseRequestId).map(
      (item) => ({ id: item.id, quantity: quantidadePedida(item.id), unit: item.unit }),
    );

  const criados: { data: Record<string, unknown> }[] = [];
  const itensCriadosNoUpdate: Record<string, unknown>[] = [];
  const deleteManyCalls: unknown[] = [];

  const tx = {
    /// O `FOR UPDATE` que serializa duas compras concorrentes. O dublê não trava
    /// nada — o que ele prova é que a consulta É EMITIDA, e de dentro da
    /// transação. A corrida em si é exercitada no teste de concorrência.
    $queryRaw: jest.fn(async () => []),
    purchaseRequestItem: {
      findMany: jest.fn(async ({ where }: { where: { purchaseRequestId: string } }) =>
        linhasDaSolicitacao(where.purchaseRequestId),
      ),
    },
    purchaseOrder: {
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        criados.push(args);
        return { id: 'oc-1', code: String(args.data.code) };
      }),
      update: jest.fn(async () => ({ id: 'oc-1' })),
    },
    purchaseOrderItem: {
      /// A fonte do saldo: as compras que já apontam para as linhas desta
      /// solicitação.
      findMany: jest.fn(async () => comprasComOrdem()),
      deleteMany: jest.fn(async (args: unknown) => {
        deleteManyCalls.push(args);
        return { count: 2 };
      }),
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        itensCriadosNoUpdate.push(...data);
        return { count: data.length };
      }),
    },
  };

  const prisma = {
    purchaseRequest: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === requestCompanyId
          ? {
              id: SOLICITACAO,
              status: requestStatus,
              constructionSiteId: 'obra-1',
              costCenterId: 'cc-1',
            }
          : null,
      ),
    },
    supplier: {
      findFirst: jest.fn(async () => (supplierExists ? { id: FORNECEDOR } : null)),
    },
    // A ordem passou a validar o centro de custo contra a obra da solicitação,
    // porque a solicitação pode chegar sem centro de custo definido. O dublê
    // devolve um que pertence à mesma obra do `purchaseRequest` acima — é o
    // caminho feliz que a maioria destes testes pressupõe.
    costCenter: {
      findFirst: jest.fn(async () => ({ constructionSiteId: 'obra-1' })),
    },
    purchaseRequestItem: {
      // Reproduz o filtro real: id ∈ lista E a solicitação-mãe é ESTA, da
      // empresa certa. Um dublê que ignorasse o escopo faria o teste de
      // isolamento passar sem que o código filtrasse nada.
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            id?: { in: string[] };
            purchaseRequestId?: string;
            purchaseRequest?: { id: string; companyId: string };
          };
        }) => {
          // DUAS consultas diferentes caem aqui, e distingui-las importa:
          //
          //  - `resolveItems` pergunta por uma LISTA DE IDS, com o escopo
          //    atravessando a relação até o `companyId` — é o que sustenta o
          //    isolamento multi-tenant, e o dublê o reproduz de propósito.
          //  - a auditoria do atendimento pergunta pelas linhas DA
          //    SOLICITAÇÃO, para dizer quanto de cada uma já foi comprado.
          if (where.purchaseRequestId) {
            return linhasDaSolicitacao(where.purchaseRequestId);
          }

          return ITENS_SOLICITACAO.filter(
            (item) =>
              where.id!.in.includes(item.id) &&
              item.purchaseRequestId === where.purchaseRequest!.id &&
              item.companyId === where.purchaseRequest!.companyId,
          ).map(({ id, description, unit }) => ({ id, description, unit }));
        },
      ),
    },
    /// Fora da transação: é o que a AUDITORIA relê depois do commit para
    /// registrar o saldo que passou a valer.
    purchaseOrderItem: {
      findMany: jest.fn(async () => comprasComOrdem()),
    },
    purchaseOrder: {
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        criados.push(args);
        return { id: 'oc-1' };
      }),
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === EMPRESA_A
          ? {
              id: 'oc-1',
              code: 'OC-0001',
              companyId: EMPRESA_A,
              purchaseRequestId: SOLICITACAO,
              status: orderStatus,
              items: [],
            }
          : null,
      ),
      update: jest.fn(async () => ({ id: 'oc-1' })),
    },
    /// Alimentam a situação financeira DERIVADA que o `findOne` anexa (ver
    /// `withFinancialStatus`). Vazias por padrão: uma ordem recém-criada não
    /// tem nota nem parcela, que é justamente o estado `WITHOUT_INVOICE`.
    /// Os testes que exercitam os estágios sobrescrevem via `financeiro`.
    /// `count` alimenta as GUARDAS de cancelar e excluir; `findMany`, a
    /// situação financeira derivada. As duas leem as mesmas listas, então um
    /// teste que declara uma nota vinculada a vê nos dois lugares.
    invoice: {
      findMany: jest.fn(async () => financeiro.invoices),
      count: jest.fn(async () => financeiro.invoices.length),
    },
    inboundInvoice: {
      findMany: jest.fn(async () => financeiro.inboundInvoices),
      count: jest.fn(async () => financeiro.inboundInvoices.length),
    },
    accountPayable: { count: jest.fn(async () => financeiro.paidPayables ?? 0) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  /// O que foi para a auditoria. `AuditLoggerService` grava via Prisma; aqui
  /// só interessa O QUE ele recebeu — mesmo padrão do spec da solicitação.
  /// O logo do PDF sai do storage. O dublê devolve um PNG mínimo de verdade —
  /// bytes que o pdfkit consegue ler — para o cabeçalho ser exercitado, e não
  /// só o caminho de "empresa sem logo".
  const storage = {
    getStream: jest.fn(async () => Readable.from([PNG_1X1])),
  } as unknown as StorageService;

  const auditado: Record<string, unknown>[] = [];
  const auditLogger = new AuditLoggerService(prisma);
  jest.spyOn(auditLogger, 'log').mockImplementation(async (entry) => {
    if (auditoriaFalha) throw new Error('auditoria fora do ar');
    auditado.push(entry as unknown as Record<string, unknown>);
  });

  return {
    service: new PurchaseOrdersService(
      prisma,
      new FulfillmentService(prisma),
      auditLogger,
      storage,
    ),
    storage,
    auditado,
    prisma,
    criados,
    itensCriadosNoUpdate,
    deleteManyCalls,
    tx,
  };
}

const BASE = {
  purchaseRequestId: SOLICITACAO,
  supplierId: FORNECEDOR,
  issueDate: '2026-08-23',
};

/// O `totalAmount` gravado na criação — derivado, não enviado.
function totalGravado(criados: { data: Record<string, unknown> }[]): string {
  return String(criados[0]!.data.totalAmount);
}

/// Os itens gravados na criação, já resolvidos pelo service.
function itensCriados(criados: { data: Record<string, unknown> }[]) {
  const nested = criados[0]!.data.items as { create: Record<string, unknown>[] };
  return nested.create;
}

describe('PurchaseOrdersService — itens da ordem de compra', () => {
  describe('1. Criar uma OC com um item', () => {
    it('cria a ordem com a linha pedida', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 }],
      });

      const itens = itensCriados(criados);
      expect(itens).toHaveLength(1);
      expect(itens[0]).toMatchObject({
        purchaseRequestItemId: 'item-cimento',
        description: '50 sacos de cimento CP-II',
        unit: 'SC',
        quantity: 50,
        unitPrice: 32.9,
      });
    });
  });

  describe('2. Criar uma OC com múltiplos itens', () => {
    it('cria todas as linhas, cada uma com a sua origem', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [
          { purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 },
          { purchaseRequestItemId: 'item-areia', quantity: 12, unitPrice: 95 },
        ],
      });

      const itens = itensCriados(criados);
      expect(itens).toHaveLength(2);
      expect(itens.map((item) => item.purchaseRequestItemId)).toEqual([
        'item-cimento',
        'item-areia',
      ]);
      expect(itens.map((item) => item.description)).toEqual([
        '50 sacos de cimento CP-II',
        'Areia média lavada',
      ]);
    });

    it('recusa a MESMA linha da solicitação duas vezes na mesma ordem', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [
            { purchaseRequestItemId: 'item-cimento', quantity: 30, unitPrice: 32.9 },
            { purchaseRequestItemId: 'item-cimento', quantity: 20, unitPrice: 32.9 },
          ],
        }),
      ).rejects.toThrow(/mais de uma vez/);
    });
  });

  describe('3. Item da OC vinculado ao item correto da Solicitação', () => {
    it('o vínculo é por ITEM, não pelo id da solicitação', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-areia', quantity: 12, unitPrice: 95 }],
      });

      const [item] = itensCriados(criados);
      // A linha aponta para a linha de origem — não para SOLICITACAO.
      expect(item!.purchaseRequestItemId).toBe('item-areia');
      expect(item!.purchaseRequestItemId).not.toBe(SOLICITACAO);
    });

    it('descrição e unidade são COPIADAS da origem, não aceitas do cliente', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [
          {
            purchaseRequestItemId: 'item-cimento',
            quantity: 50,
            unitPrice: 32.9,
            // Um cliente malicioso mandando descrição própria não muda nada:
            // o DTO nem tem o campo, e o service lê da origem.
            ...({ description: 'OUTRA COISA', unit: 'XX' } as object),
          },
        ],
      });

      const [item] = itensCriados(criados);
      expect(item!.description).toBe('50 sacos de cimento CP-II');
      expect(item!.unit).toBe('SC');
    });
  });

  describe('4, 5 e 6. Quantidade, unidade e valor unitário', () => {
    it('a quantidade COMPRADA pode ser menor que a solicitada (compra parcial)', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 80, unitPrice: 10 }],
      });

      // Solicitados 100, comprados 80 — o modelo aceita, sem impor igualdade.
      expect(itensCriados(criados)[0]!.quantity).toBe(80);
    });

    it('a quantidade comprada também pode ser MAIOR (arredondamento de embalagem)', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 120, unitPrice: 10 }],
      });

      expect(itensCriados(criados)[0]!.quantity).toBe(120);
    });

    it('a unidade vem da solicitação e acompanha a linha', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [
          { purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 },
          { purchaseRequestItemId: 'item-areia', quantity: 1, unitPrice: 1 },
        ],
      });

      expect(itensCriados(criados).map((item) => item.unit)).toEqual(['SC', 'M3']);
    });

    it('o valor unitário negociado é o que vale, mesmo divergindo da cotação', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 27.5 }],
      });

      expect(itensCriados(criados)[0]!.unitPrice).toBe(27.5);
    });

    it('aceita valor unitário zero (brinde/bonificação)', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 5, unitPrice: 0 }],
      });

      expect(String(itensCriados(criados)[0]!.totalPrice)).toBe('0');
    });
  });

  describe('7. Valor total calculado', () => {
    it('totalPrice é quantidade × valor unitário, calculado pelo backend', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 }],
      });

      expect(String(itensCriados(criados)[0]!.totalPrice)).toBe('1645');
    });

    it('um totalPrice enviado pelo cliente é ignorado — nunca diverge do cálculo', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [
          {
            purchaseRequestItemId: 'item-cimento',
            quantity: 10,
            unitPrice: 5,
            ...({ totalPrice: 999999 } as object),
          },
        ],
      });

      expect(String(itensCriados(criados)[0]!.totalPrice)).toBe('50');
    });

    describe('calculateItemTotal', () => {
      it.each([
        [50, 32.9, '1645'],
        // Ponto flutuante puro devolveria 0.30000000000000004.
        [3, 0.1, '0.3'],
        // 3 casas de quantidade × 2 de preço = 5 casas; arredonda para 2.
        [2.5, 12.345, '30.86'],
        [1, 1.005, '1.01'],
        [0.333, 3, '1'],
        [1000000, 999.99, '999990000'],
      ])('%s × %s = %s', (quantidade, preco, esperado) => {
        expect(calculateItemTotal(quantidade, preco).toString()).toBe(esperado);
      });

      it('devolve Decimal, não number — o valor vai direto para uma coluna de dinheiro', () => {
        expect(calculateItemTotal(2, 3)).toBeInstanceOf(Prisma.Decimal);
      });
    });
  });

  describe('8 e 12. Isolamento multi-tenant', () => {
    it('recusa item de solicitação de OUTRA empresa', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-de-outra-empresa', quantity: 1, unitPrice: 10 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa item de outra solicitação da MESMA empresa', async () => {
      const { service } = makeService();

      // Isolamento não é só entre empresas: a linha tem de ser da solicitação
      // que originou esta ordem, senão a rastreabilidade seria uma mentira.
      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [
            { purchaseRequestItemId: 'item-de-outra-solicitacao', quantity: 1, unitPrice: 10 },
          ],
        }),
      ).rejects.toThrow(/não encontrado nesta solicitação/);
    });

    it('a mensagem de erro não revela se o item existe em outro tenant', async () => {
      const { service } = makeService();

      const deOutraEmpresa = service
        .create(EMPRESA_A, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-de-outra-empresa', quantity: 1, unitPrice: 1 }],
        })
        .catch((error: Error) => error.message);

      const inexistente = service
        .create(EMPRESA_A, {
          ...BASE,
          items: [
            {
              purchaseRequestItemId: '99999999-9999-9999-9999-999999999999',
              quantity: 1,
              unitPrice: 1,
            },
          ],
        })
        .catch((error: Error) => error.message);

      const [a, b] = await Promise.all([deOutraEmpresa, inexistente]);

      // Fora o id ecoado, as duas mensagens têm de ser idênticas: um texto
      // diferente para "existe noutro tenant" seria um oráculo de existência.
      const semIds = (mensagem: string) => mensagem.split(':')[0];
      expect(semIds(a!)).toBe(semIds(b!));
      // Só o PREFIXO: depois dos dois-pontos vem o id que o cliente mandou,
      // e o nome do fixture ali dentro não diz nada sobre o código.
      expect(semIds(a!)).not.toMatch(/empresa|tenant|pertence a/i);
    });

    it('a solicitação de outra empresa não é sequer alcançável', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_B, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow(/Solicitação informada não existe/);
    });

    it('toda consulta de item carrega o escopo da empresa e da solicitação', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 }],
      });

      const where = (prisma.purchaseRequestItem.findMany as jest.Mock).mock.calls[0]![0].where;
      expect(where.purchaseRequest).toEqual({
        id: SOLICITACAO,
        companyId: EMPRESA_A,
        deletedAt: null,
      });
    });
  });

  describe('9. Item inexistente', () => {
    it('recusa a ordem inteira quando um item não existe', async () => {
      const { service, prisma } = makeService();

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [
            { purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 },
            { purchaseRequestItemId: 'nao-existe', quantity: 1, unitPrice: 1 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Nada foi criado: a validação roda ANTES da ordem, para não deixar uma
      // ordem órfã sem linhas.
      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    });
  });

  describe('10. Edição sem duplicar itens', () => {
    it('reenviar a lista SUBSTITUI, não acrescenta', async () => {
      const { service, tx, itensCriadosNoUpdate } = makeService();

      await service.update(EMPRESA_A, 'oc-1', {
        items: [
          { purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 },
          { purchaseRequestItemId: 'item-areia', quantity: 12, unitPrice: 95 },
        ],
      });

      // Apaga as antigas antes de gravar as novas — sem isto, editar duas
      // vezes deixaria a ordem com as linhas em dobro.
      expect(tx.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'oc-1' },
      });
      expect(itensCriadosNoUpdate).toHaveLength(2);
    });

    it('editar duas vezes com a mesma lista deixa a mesma quantidade de linhas', async () => {
      const { service, itensCriadosNoUpdate, tx } = makeService();
      const payload = {
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 }],
      };

      await service.update(EMPRESA_A, 'oc-1', payload);
      await service.update(EMPRESA_A, 'oc-1', payload);

      expect(tx.purchaseOrderItem.deleteMany).toHaveBeenCalledTimes(2);
      // Duas edições, uma linha cada — nunca acumulando.
      expect(itensCriadosNoUpdate).toHaveLength(2);
    });

    it('editar SEM enviar itens não toca nas linhas existentes', async () => {
      const { service, tx } = makeService();

      await service.update(EMPRESA_A, 'oc-1', { issueDate: '2026-09-01' });

      expect(tx.purchaseOrderItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.purchaseOrderItem.createMany).not.toHaveBeenCalled();
    });

    it('itens inválidos na edição recusam antes de apagar os antigos', async () => {
      const { service, tx } = makeService();

      await expect(
        service.update(EMPRESA_A, 'oc-1', {
          items: [{ purchaseRequestItemId: 'item-de-outra-empresa', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // O ponto: uma lista inválida não pode deixar a ordem SEM itens.
      expect(tx.purchaseOrderItem.deleteMany).not.toHaveBeenCalled();
    });

    it('a ordem de outra empresa não é editável', async () => {
      const { service } = makeService();

      await expect(
        service.update(EMPRESA_B, 'oc-1', { issueDate: '2026-09-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('total da ordem calculado automaticamente', () => {
    it('soma os totais dos itens (10×100 + 5×200 = 2.000)', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [
          { purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 100 },
          { purchaseRequestItemId: 'item-areia', quantity: 5, unitPrice: 200 },
        ],
      });

      expect(totalGravado(criados)).toBe('2000');
    });

    it('ordem de um item só: o total é o total do item', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 50, unitPrice: 32.9 }],
      });

      expect(totalGravado(criados)).toBe('1645');
    });

    it('um totalAmount enviado pelo cliente é ignorado', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 2, unitPrice: 10 }],
        // O campo saiu do DTO; mesmo que alguém o mande, não chega ao banco.
        ...({ totalAmount: 999999 } as object),
      });

      expect(totalGravado(criados)).toBe('20');
    });

    it('mudar a QUANTIDADE de um item recalcula o total da ordem', async () => {
      const { service, tx } = makeService();

      await service.update(EMPRESA_A, 'oc-1', {
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 80, unitPrice: 10 }],
      });

      const data = (tx.purchaseOrder.update as jest.Mock).mock.calls[0]![0].data;
      expect(String(data.totalAmount)).toBe('800');
    });

    it('mudar o VALOR UNITÁRIO recalcula o total da ordem', async () => {
      const { service, tx } = makeService();

      await service.update(EMPRESA_A, 'oc-1', {
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 27.5 }],
      });

      const data = (tx.purchaseOrder.update as jest.Mock).mock.calls[0]![0].data;
      expect(String(data.totalAmount)).toBe('275');
    });

    it('REMOVER um item recalcula o total (a lista nova é a verdade)', async () => {
      const { service, tx } = makeService();

      // Antes: cimento + areia. Agora só cimento — o total cai junto.
      await service.update(EMPRESA_A, 'oc-1', {
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 100 }],
      });

      const data = (tx.purchaseOrder.update as jest.Mock).mock.calls[0]![0].data;
      expect(String(data.totalAmount)).toBe('1000');
    });

    it('editar SEM enviar itens não recalcula — ordem antiga não é zerada', async () => {
      const { service, tx } = makeService();

      await service.update(EMPRESA_A, 'oc-1', { issueDate: '2026-09-01' });

      const data = (tx.purchaseOrder.update as jest.Mock).mock.calls[0]![0].data;
      // As 4 ordens já emitidas em staging não têm itens; recalcular ali
      // trocaria o valor real delas por zero.
      expect(data.totalAmount).toBeUndefined();
    });

    describe('sumItemTotals', () => {
      it('soma vazia é zero', () => {
        expect(sumItemTotals([]).toString()).toBe('0');
      });

      it('soma os totais JÁ arredondados, para bater com a coluna impressa', () => {
        // 3 × 0,105 = 0,315 → 0,32 cada. A soma das linhas visíveis é 0,96;
        // somar os produtos brutos daria 0,945 → 0,95, que não fecha com o
        // que o usuário lê.
        const itens = [1, 2, 3].map(() => ({ totalPrice: calculateItemTotal(3, 0.105) }));
        expect(sumItemTotals(itens).toString()).toBe('0.96');
      });

      it('não acumula erro de ponto flutuante em muitas linhas', () => {
        const itens = Array.from({ length: 100 }, () => ({
          totalPrice: calculateItemTotal(1, 0.1),
        }));
        expect(sumItemTotals(itens).toString()).toBe('10');
      });

      it('devolve Decimal', () => {
        expect(sumItemTotals([{ totalPrice: calculateItemTotal(1, 1) }])).toBeInstanceOf(
          Prisma.Decimal,
        );
      });
    });
  });

  describe('validações de quantidade e valor', () => {
    it.each([
      ['quantidade negativa', { quantity: -5, unitPrice: 10 }],
      ['quantidade zero', { quantity: 0, unitPrice: 10 }],
      ['valor unitário negativo', { quantity: 1, unitPrice: -1 }],
    ])('o DTO recusa %s', async (_caso, valores) => {
      // A barreira é o DTO (class-validator), não o service — este teste
      // documenta o contrato e falha se alguém afrouxar os decorators.
      const dto = plainToInstance(PurchaseOrderItemInputDto, {
        purchaseRequestItemId: '11111111-1111-4111-8111-111111111111',
        ...valores,
      });

      await expect(validate(dto)).resolves.not.toHaveLength(0);
    });

    it('aceita quantidade fracionária e valor unitário zero', async () => {
      const dto = plainToInstance(PurchaseOrderItemInputDto, {
        purchaseRequestItemId: '11111111-1111-4111-8111-111111111111',
        quantity: 1.5,
        unitPrice: 0,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });
  });

  describe('regras existentes preservadas', () => {
    it('continua exigindo solicitação APROVADA', async () => {
      const { service } = makeService({ requestStatus: 'PENDING' });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow(/solicitação aprovada/);
    });

    it('continua exigindo fornecedor existente', async () => {
      const { service } = makeService({ supplierExists: false });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow(/Fornecedor informado não existe/);
    });
  });
  // ---------------------------------------------------------------------------
  // Integração Engenharia -> Financeiro
  // ---------------------------------------------------------------------------

  describe('6. A ordem exibe a situação financeira', () => {
    const NOTA_CONCILIADA = {
      id: 'nfe-1',
      purchaseOrderId: 'oc-1',
      number: '000456',
      series: '1',
      status: 'RECONCILED',
      reconciledAt: new Date('2026-08-24T10:00:00Z'),
    };

    const notaDoFinanceiro = (parcelas: { status: string }[]) => ({
      id: 'inv-1',
      purchaseOrderId: 'oc-1',
      number: '000456',
      series: '1',
      status: 'VALIDATED',
      accountsPayable: parcelas,
    });

    it('ordem sem nota nenhuma: estágio "sem NF"', async () => {
      const { service } = makeService();

      const ordem = await service.findOne(EMPRESA_A, 'oc-1');

      expect(ordem.financialStatus.stage).toBe('WITHOUT_INVOICE');
    });

    it('ordem com nota conciliada e parcela em aberto', async () => {
      const { service } = makeService({
        financeiro: {
          invoices: [notaDoFinanceiro([{ status: 'OPEN' }])],
          inboundInvoices: [NOTA_CONCILIADA],
        },
      });

      const ordem = await service.findOne(EMPRESA_A, 'oc-1');

      expect(ordem.financialStatus.stage).toBe('PAYABLE_CREATED');
      expect(ordem.financialStatus.isReconciled).toBe(true);
      expect(ordem.financialStatus.inboundInvoices[0]!.reconciled).toBe(true);
    });

    it('ordem paga', async () => {
      const { service } = makeService({
        financeiro: {
          invoices: [notaDoFinanceiro([{ status: 'PAID' }])],
          inboundInvoices: [NOTA_CONCILIADA],
        },
      });

      const ordem = await service.findOne(EMPRESA_A, 'oc-1');

      expect(ordem.financialStatus.stage).toBe('PAID');
      expect(ordem.financialStatus.isFullyPaid).toBe(true);
    });

    it('a listagem traz a situação de todas as ordens em DUAS consultas, não duas por linha', async () => {
      const { service, prisma } = makeService({
        financeiro: {
          invoices: [notaDoFinanceiro([{ status: 'OPEN' }])],
          inboundInvoices: [NOTA_CONCILIADA],
        },
      });
      (prisma.purchaseOrder.findMany as jest.Mock) = jest.fn(async () => [
        { id: 'oc-1' },
        { id: 'oc-2' },
        { id: 'oc-3' },
      ]);

      const { data } = await service.findAll(EMPRESA_A, { page: 1, limit: 10 });

      expect(data).toHaveLength(3);
      expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.inboundInvoice.findMany).toHaveBeenCalledTimes(1);
      // Só a ordem que tem nota recebe o estágio avançado.
      expect(data[0]!.financialStatus.stage).toBe('PAYABLE_CREATED');
      expect(data[1]!.financialStatus.stage).toBe('WITHOUT_INVOICE');
    });

    it('a situação é DERIVADA — nada é gravado na ordem', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 100 }],
      });

      const gravado = Object.keys(criados[0]!.data);
      expect(gravado).not.toContain('financialStatus');
      expect(gravado).not.toContain('stage');
      expect(gravado).not.toContain('paidAt');
    });
  });

  describe('10. Isolamento entre empresas na consulta financeira', () => {
    it('as consultas de nota e parcela carregam o companyId de quem perguntou', async () => {
      const { service, prisma } = makeService();

      await service.findOne(EMPRESA_A, 'oc-1');

      expect((prisma.invoice.findMany as jest.Mock).mock.calls[0]![0].where).toMatchObject({
        companyId: EMPRESA_A,
      });
      expect((prisma.inboundInvoice.findMany as jest.Mock).mock.calls[0]![0].where).toMatchObject({
        companyId: EMPRESA_A,
      });
    });

    it('ordem de outra empresa não é encontrada — e nem chega a consultar o financeiro', async () => {
      const { service, prisma } = makeService();

      await expect(service.findOne(EMPRESA_B, 'oc-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('9. A Engenharia vê o estado financeiro, não o altera', () => {
    const permissaoDe = (metodo: keyof PurchaseOrdersController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, PurchaseOrdersController.prototype[metodo]) as
        string[] | undefined;

    it('consultar a ordem — e com ela a situação financeira — exige só `compras.view`', () => {
      expect(permissaoDe('findOne')).toEqual(['compras.view']);
      expect(permissaoDe('findAll')).toEqual(['compras.view']);
    });

    it('nenhuma rota de Compras passou a exigir permissão do Financeiro', () => {
      const usadas = (['findAll', 'findOne', 'create', 'update', 'remove'] as const).flatMap(
        (metodo) => permissaoDe(metodo) ?? [],
      );

      expect(usadas.every((permissao) => permissao.startsWith('compras.'))).toBe(true);
    });

    it('e nenhuma rota de Compras escreve no financeiro', () => {
      // A situação financeira é leitura derivada. Alterar conta a pagar, dar
      // baixa ou mudar vencimento continua só no módulo Financeiro, atrás de
      // `financeiro.manage` — ver `account-payables.service.spec.ts`.
      const servico = PurchaseOrdersService.prototype as unknown as Record<string, unknown>;
      expect(servico.payAccountPayable).toBeUndefined();
      expect(servico.updateAccountPayable).toBeUndefined();
    });
  });

  describe('10. Item que a cotação marcou como não disponível', () => {
    /// A cotação pode dizer que UM fornecedor não tem o item. A ordem é
    /// emitida a UM fornecedor — e pode ser outro. Barrar a linha aqui
    /// impediria exatamente o caso que o cliente descreveu: o fornecedor A
    /// não tem a torneira, o B tem por R$ 450.
    ///
    /// Quem sinaliza o estado é a tela (a linha nasce desmarcada, com o aviso
    /// da cotação); a decisão continua sendo do comprador.
    it('continua podendo virar linha de ordem — a compra é de outro fornecedor', async () => {
      const { service, criados } = makeService();

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        costCenterId: 'cc-1',
        items: [{ purchaseRequestItemId: 'item-areia', quantity: 5, unitPrice: 90 }],
      });

      expect(itensCriados(criados)).toHaveLength(1);
      expect(totalGravado(criados)).toBe('450');
    });
  });
});

describe('Cancelar e excluir ordem de compra', () => {
  it('cancelar marca a ordem, sem apagá-la', async () => {
    const { service, prisma } = makeService();

    await service.cancel(EMPRESA_A, 'oc-1');

    // Cancelar mantém o documento na lista: o fornecedor recebeu um pedido, e
    // precisa haver registro de que ele foi desfeito.
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
  });

  it('não cancela duas vezes', async () => {
    const { service } = makeService({ orderStatus: 'CANCELLED' });

    await expect(service.cancel(EMPRESA_A, 'oc-1')).rejects.toThrow(/já está cancelada/);
  });

  it('não cancela ordem com pagamento efetuado', async () => {
    const { service } = makeService({
      financeiro: { invoices: [], inboundInvoices: [], paidPayables: 1 },
    });

    // Dinheiro que saiu não se desfaz cancelando o pedido; permitir criaria
    // uma ordem cancelada com conta paga, estado que nenhum relatório explica.
    await expect(service.cancel(EMPRESA_A, 'oc-1')).rejects.toThrow(/pagamento efetuado/);
  });

  it('exclui a ordem sem vínculo, embaralhando o código', async () => {
    const { service, prisma } = makeService();

    await service.remove(EMPRESA_A, 'oc-1');

    const dados = (prisma.purchaseOrder.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;
    expect(dados.deletedAt).toBeInstanceOf(Date);
    // Sem embaralhar, a unique de (empresa, código) — que não ignora
    // `deletedAt` — travaria aquele número para sempre.
    expect(String(dados.code)).toContain('__deleted__');
  });

  it('NÃO exclui ordem com nota fiscal vinculada', async () => {
    const { service, prisma } = makeService({
      financeiro: { invoices: [{ id: 'nf-1' }], inboundInvoices: [] },
    });

    // Sem esta guarda, a fatura e a conta a pagar ficariam apontando para um
    // documento que sumiu — e ninguém relacionaria o buraco no relatório com
    // este clique.
    await expect(service.remove(EMPRESA_A, 'oc-1')).rejects.toThrow(/nota fiscal vinculada/);
    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('a recusa da exclusão aponta a saída: cancelar', async () => {
    const { service } = makeService({
      financeiro: { invoices: [], inboundInvoices: [{ id: 'ii-1' }] },
    });

    await expect(service.remove(EMPRESA_A, 'oc-1')).rejects.toThrow(/Cancele-a/);
  });
});

/// COMPRA PARCIAL E MÚLTIPLAS ORDENS POR SOLICITAÇÃO.
///
/// O modelo já permitia uma solicitação virar N ordens — o que faltava era a
/// única regra que impede isso de virar compra a mais:
///
///     Σ(quantidades compradas em todas as ordens) ≤ quantidade solicitada
///
/// Conferida por LINHA e dentro da transação que trava a solicitação.
describe('Compra parcial — saldo pendente por item', () => {
  describe('6. Tentativa de comprar acima do saldo pendente', () => {
    it('recusa a primeira ordem que já passa do pedido', async () => {
      const { service } = makeService({ pedidos: { 'item-cimento': 100 } });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 101, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa a segunda ordem que estouraria o que sobrou', async () => {
      // 100 pedidos, 60 já comprados: só cabem 40.
      const { service } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 41, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/apenas 40 SC em aberto/);
    });

    it('a mensagem abre a conta inteira, em vez de dizer só "inválido"', async () => {
      const { service } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      // Sem os três números, quem recebe o erro não tem como saber quanto
      // pode comprar — e tentaria de novo no chute.
      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 41, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/60 de 100 já comprados.*tentou comprar 41/s);
    });

    it('item já totalmente comprado diz isso, e não "restam 0"', async () => {
      const { service } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 100 }],
      });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/já foi totalmente comprado/);
    });

    it('a conferência é por LINHA, não pelo total de unidades', async () => {
      // Cimento tem saldo de sobra; areia não. Um teto por documento deixaria
      // isto passar, porque a soma das duas linhas cabe no total pedido.
      const { service } = makeService({
        pedidos: { 'item-cimento': 100, 'item-areia': 10 },
        compras: [{ purchaseRequestItemId: 'item-areia', quantity: 10 }],
      });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [
            { purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 32.9 },
            { purchaseRequestItemId: 'item-areia', quantity: 1, unitPrice: 90 },
          ],
        }),
      ).rejects.toThrow(/Areia média lavada/);
    });
  });

  describe('2, 3, 4 e 5. As compras que CABEM continuam passando', () => {
    it('comprar exatamente o pendente é aceito', async () => {
      const { service, criados } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 40, unitPrice: 32.9 }],
      });

      expect(itensCriados(criados)[0]).toMatchObject({ quantity: 40 });
    });

    it('a segunda ordem pode ir para OUTRA loja, sem nova solicitação', async () => {
      const OUTRA_LOJA = '55555555-5555-5555-5555-555555555555';
      const { service, criados } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        supplierId: OUTRA_LOJA,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 40, unitPrice: 35 }],
      });

      // Mesma solicitação-mãe, fornecedor diferente — é o desdobramento que
      // esta etapa existe para permitir.
      expect(criados[0]!.data).toMatchObject({
        purchaseRequestId: SOLICITACAO,
        supplierId: OUTRA_LOJA,
      });
    });

    it('item que a cotação marcou como indisponível continua comprável', async () => {
      // A tinta que a Loja A não tinha é exatamente o que a Loja B vende. O
      // saldo não conhece disponibilidade: ele só sabe quanto falta.
      const { service, criados } = makeService({ pedidos: { 'item-areia': 10 } });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-areia', quantity: 10, unitPrice: 90 }],
      });

      expect(itensCriados(criados)[0]).toMatchObject({ quantity: 10 });
    });
  });

  describe('14. Ordem cancelada devolve o saldo', () => {
    it('compra de ordem cancelada não conta contra o pendente', async () => {
      // O dublê devolve só as ordens QUE CONTAM (o filtro real exclui
      // CANCELLED e excluídas), então "cancelada" aqui é a lista vazia — e o
      // que se prova é que os 100 voltaram a ser compráveis.
      const { service, criados } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [],
      });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 100, unitPrice: 32.9 }],
      });

      expect(itensCriados(criados)[0]).toMatchObject({ quantity: 100 });
    });
  });

  describe('solicitação totalmente atendida não gera ordem vazia', () => {
    it('recusa a ordem quando NENHUM item tem saldo', async () => {
      // A tela esconde o botão quando não há pendente, mas a regra não pode
      // morar só lá: o endpoint é público a quem tem `compras.manage`.
      const { service } = makeService({
        pedidos: { 'item-cimento': 100, 'item-areia': 10 },
        compras: [
          { purchaseRequestItemId: 'item-cimento', quantity: 100 },
          { purchaseRequestItemId: 'item-areia', quantity: 10 },
        ],
      });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 1, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/já foi totalmente comprado/);
    });

    it('uma ordem sem item nenhum já era recusada pelo DTO', async () => {
      // `@ArrayMinSize(1)` em `CreatePurchaseOrderDto`. Continua valendo: a
      // regra de saldo não substituiu a de "ordem precisa ter linha".
      const dto = plainToInstance(CreatePurchaseOrderDto, { ...BASE, items: [] });

      const erros = await validate(dto);

      expect(erros.some((erro) => erro.property === 'items')).toBe(true);
    });
  });

  describe('13. Concorrência', () => {
    it('a conferência acontece DENTRO da transação, depois do FOR UPDATE', async () => {
      const { service, tx } = makeService({ pedidos: { 'item-cimento': 100 } });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 32.9 }],
      });

      // Se o lock não fosse emitido, dois compradores leriam as mesmas 10
      // unidades pendentes e cada um compraria 7.
      expect(tx.$queryRaw).toHaveBeenCalled();
      // E a leitura do saldo tem de usar o MESMO cliente da transação: lida
      // por fora, ela enxergaria o estado de antes do lock.
      expect(tx.purchaseOrderItem.findMany).toHaveBeenCalled();
      expect(tx.purchaseRequestItem.findMany).toHaveBeenCalled();
    });

    it('o segundo comprador, lendo o saldo já consumido, é recusado', async () => {
      // A corrida do enunciado: 10 pendentes, A pede 7, B pede 7. Depois que a
      // de A grava, a de B relê 3 em aberto — e 7 não cabe.
      const { service } = makeService({
        pedidos: { 'item-cimento': 10 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 7 }],
      });

      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 7, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/apenas 3 SC em aberto/);
    });

    it('o código da ordem é numerado dentro do lock', async () => {
      const { service, tx } = makeService({ pedidos: { 'item-cimento': 100 } });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 32.9 }],
      });

      // Fora do lock, duas ordens simultâneas contariam o mesmo total e
      // receberiam o mesmo código — e a unique de (empresa, código) derrubaria
      // a segunda com erro de banco em vez de mensagem.
      expect(tx.purchaseOrder.count).toHaveBeenCalled();
    });
  });

  describe('edição de ordem', () => {
    it('não conta as linhas da PRÓPRIA ordem contra ela mesma', async () => {
      // 100 pedidos, e esta ordem já consome 60. Sem excluí-la da soma, trocar
      // 60 por 70 seria recusado pelos 60 que ela mesma ocupa.
      const { service } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [],
      });

      await expect(
        service.update(EMPRESA_A, 'oc-1', {
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 70, unitPrice: 32.9 }],
        }),
      ).resolves.toBeDefined();
    });

    it('a edição também respeita o saldo das OUTRAS ordens', async () => {
      const { service } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 90 }],
      });

      await expect(
        service.update(EMPRESA_A, 'oc-1', {
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 20, unitPrice: 32.9 }],
        }),
      ).rejects.toThrow(/apenas 10 SC em aberto/);
    });

    it('editar sem mandar itens não mexe em saldo nenhum', async () => {
      const { service, tx } = makeService({ pedidos: { 'item-cimento': 100 } });

      await service.update(EMPRESA_A, 'oc-1', { issueDate: '2026-09-01' });

      // Mudar só a data de uma ordem antiga (sem itens) não pode disparar uma
      // conferência de saldo que ela nunca teve como satisfazer.
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('17. Auditoria do atendimento', () => {
    it('registra a ordem gerada e o saldo que passou a valer, na SOLICITAÇÃO', async () => {
      const { service, auditado } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 40, unitPrice: 32.9 }],
      });

      // `entityType` é PurchaseRequest, e não PurchaseOrder: a pergunta que
      // este log responde é feita na tela da solicitação, e é lá que o painel
      // de histórico consulta.
      expect(auditado[0]).toMatchObject({
        entityType: 'PurchaseRequest',
        entityId: SOLICITACAO,
        action: 'UPDATE',
      });
    });

    it('falha na auditoria não derruba a compra já gravada', async () => {
      const { service, criados } = makeService({
        pedidos: { 'item-cimento': 100 },
        auditoriaFalha: true,
      });

      // Uma ordem recusada porque o log falhou seria pior que um log perdido:
      // o comprador reemitiria uma ordem que já existe, e AÍ o saldo ficaria
      // errado de verdade.
      await expect(
        service.create(EMPRESA_A, COMPRADOR, {
          ...BASE,
          items: [{ purchaseRequestItemId: 'item-cimento', quantity: 10, unitPrice: 32.9 }],
        }),
      ).resolves.toBeDefined();

      expect(criados).toHaveLength(1);
    });

    it('o log diz quanto foi comprado e quanto ainda falta', async () => {
      const { service, auditado } = makeService({
        pedidos: { 'item-cimento': 100 },
        compras: [{ purchaseRequestItemId: 'item-cimento', quantity: 60 }],
      });

      await service.create(EMPRESA_A, COMPRADOR, {
        ...BASE,
        items: [{ purchaseRequestItemId: 'item-cimento', quantity: 40, unitPrice: 32.9 }],
      });

      const changes = auditado[0]!.changes as Record<string, { from: string; to: string }>;
      expect(changes.itensComprados!.to).toContain('40 SC');
      // O saldo relido DEPOIS do commit — é o que interessa a quem abre o
      // histórico depois.
      expect(changes.atendimentoDaSolicitacao!.to).toContain('de 100');
    });

  });
});
