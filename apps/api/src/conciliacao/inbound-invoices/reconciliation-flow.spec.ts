import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { InboundInvoicesService } from './inbound-invoices.service';

const d = (v: string) => new Prisma.Decimal(v);

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';
const USUARIO = '33333333-3333-4333-8333-333333333333';
const FORNECEDOR = 'aaaaaaaa-0000-4000-8000-000000000001';
const CENTRO = 'cccccccc-0000-4000-8000-000000000001';
const OBRA = 'dddddddd-0000-4000-8000-000000000001';

function ocItem(descricao: string, qtd: string, preco: string, un = 'SC') {
  return {
    description: descricao,
    unit: un,
    quantity: d(qtd),
    unitPrice: d(preco),
    totalPrice: d(qtd).times(d(preco)).toDecimalPlaces(2),
  };
}

function makeService(options: { notaStatus?: string; ordens?: Record<string, unknown>[] } = {}) {
  const { notaStatus = 'PENDING', ordens } = options;

  const parcelas: Record<string, unknown>[] = [];
  const auditoria: Record<string, unknown>[] = [];

  const nota = {
    id: 'nota-1',
    companyId: EMPRESA_A,
    status: notaStatus,
    number: '12345',
    series: '1',
    issueDate: new Date('2026-08-20T00:00:00Z'),
    totalAmount: d('1645.00'),
    supplierId: FORNECEDOR,
    supplierName: 'FORNECEDORA LTDA',
    supplierDocument: '12345678000190',
    hasFullDocument: true,
    items: [ocItem('Cimento CP-II 50kg', '50', '32.90')],
  };

  const ordensPadrao = [
    {
      id: 'oc-compativel',
      code: 'OC-0001',
      companyId: EMPRESA_A,
      supplierId: FORNECEDOR,
      totalAmount: d('1645.00'),
      issueDate: new Date('2026-08-15T00:00:00Z'),
      costCenterId: CENTRO,
      constructionSiteId: OBRA,
      supplier: {
        id: FORNECEDOR,
        legalName: 'FORNECEDORA LTDA',
        tradeName: null,
        document: '12345678000190',
      },
      costCenter: { id: CENTRO, code: 'CC-01', name: 'Estrutura' },
      constructionSite: { id: OBRA, code: 'OBRA-1', name: 'Paineiras' },
      items: [ocItem('Cimento CP-II 50kg', '50', '32.90')],
    },
    {
      id: 'oc-outros-itens',
      code: 'OC-0002',
      companyId: EMPRESA_A,
      supplierId: FORNECEDOR,
      totalAmount: d('1645.00'),
      issueDate: new Date('2026-08-15T00:00:00Z'),
      costCenterId: CENTRO,
      constructionSiteId: OBRA,
      supplier: {
        id: FORNECEDOR,
        legalName: 'FORNECEDORA LTDA',
        tradeName: null,
        document: '12345678000190',
      },
      costCenter: { id: CENTRO, code: 'CC-01', name: 'Estrutura' },
      constructionSite: { id: OBRA, code: 'OBRA-1', name: 'Paineiras' },
      items: [ocItem('Areia média lavada', '17.32', '95.00', 'M3')],
    },
  ];

  const listaOrdens = ordens ?? ordensPadrao;

  const tx = {
    invoice: { create: jest.fn(async () => ({ id: 'nota-financeiro-1' })) },
    accountPayable: {
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        parcelas.push(...data);
        return { count: data.length };
      }),
    },
    inboundInvoice: { update: jest.fn() },
  };

  const prisma = {
    inboundInvoice: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === EMPRESA_A ? nota : null,
      ),
      groupBy: jest.fn(async () => []),
    },
    purchaseOrder: {
      findMany: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        listaOrdens.filter((o) => o.companyId === where.companyId),
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; companyId: string } }) =>
          listaOrdens.find((o) => o.id === where.id && o.companyId === where.companyId) ?? null,
      ),
    },
    costCenter: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; companyId: string } }) =>
        where.id === CENTRO && where.companyId === EMPRESA_A
          ? { id: CENTRO, constructionSiteId: OBRA }
          : null,
      ),
    },
    supplier: { findFirst: jest.fn(async () => ({ id: FORNECEDOR })) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (c: typeof tx) => Promise<unknown>)(tx) : arg,
    ),
  } as unknown as PrismaService;

  const service = new InboundInvoicesService(prisma, {
    log: jest.fn(async (entrada: Record<string, unknown>) => {
      auditoria.push(entrada);
    }),
  } as unknown as AuditLoggerService);

  return { service, prisma, parcelas, auditoria, tx };
}

const RECONCILE_BASE = { paymentMethod: 'PIX' as const, paymentTerms: 'CASH' as const };

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('Conciliação — sugestão e comparação', () => {
  describe('6. Múltiplas OCs candidatas', () => {
    it('ordena pela compatibilidade: a de itens iguais vem primeiro', async () => {
      const { service } = makeService();

      const sugestoes = await service.suggestions(EMPRESA_A, 'nota-1');

      // As duas têm o MESMO valor e a MESMA data. Só os itens as distinguem —
      // e é por isso que os itens entraram no score.
      expect(sugestoes).toHaveLength(2);
      expect(sugestoes[0]!.code).toBe('OC-0001');
      expect(sugestoes[0]!.score).toBeGreaterThan(sugestoes[1]!.score);
    });

    it('cada candidata já vem com a comparação resolvida', async () => {
      const { service } = makeService();

      const [melhor, pior] = await service.suggestions(EMPRESA_A, 'nota-1');

      expect(melhor!.compatibility.matchedItems).toBe(1);
      expect(melhor!.compatibility.hasDivergence).toBe(false);
      expect(pior!.compatibility.divergentItems).toBeGreaterThan(0);
    });

    it('usa os itens da ORDEM, não os da solicitação', async () => {
      const { service, prisma } = makeService();

      await service.suggestions(EMPRESA_A, 'nota-1');

      const include = (prisma.purchaseOrder.findMany as jest.Mock).mock.calls[0]![0].include;
      expect(include.items).toBeDefined();
      // A solicitação é o que foi PEDIDO com preço estimado; a ordem é o que
      // foi COMPRADO com preço negociado — é este o lado a conferir.
      expect(include.purchaseRequest).toBeUndefined();
    });
  });

  describe('7. Seleção manual de OC', () => {
    it('compara com uma ordem escolhida à mão', async () => {
      const { service } = makeService();

      const relatorio = await service.compareWithOrder(EMPRESA_A, 'nota-1', 'oc-outros-itens');

      expect(relatorio.checks.map((c) => c.key)).toContain('items');
      expect(relatorio.divergentItems).toBeGreaterThan(0);
    });

    it('11. ordem de OUTRA empresa não é comparável', async () => {
      const { service } = makeService({
        ordens: [
          {
            id: 'oc-empresa-b',
            code: 'OC-B',
            companyId: EMPRESA_B,
            supplierId: FORNECEDOR,
            totalAmount: d('1645.00'),
            issueDate: new Date('2026-08-15T00:00:00Z'),
            costCenterId: CENTRO,
            constructionSiteId: OBRA,
            supplier: { id: FORNECEDOR, legalName: 'X', tradeName: null, document: '1' },
            costCenter: null,
            constructionSite: null,
            items: [],
          },
        ],
      });

      await expect(
        service.compareWithOrder(EMPRESA_A, 'nota-1', 'oc-empresa-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('10 e 16. nota de outra empresa não é alcançável', async () => {
      const { service } = makeService();

      await expect(service.suggestions(EMPRESA_B, 'nota-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('toda consulta de ordem carrega o companyId', async () => {
      const { service, prisma } = makeService();

      await service.compareWithOrder(EMPRESA_A, 'nota-1', 'oc-compativel');

      expect((prisma.purchaseOrder.findFirst as jest.Mock).mock.calls[0]![0].where.companyId).toBe(
        EMPRESA_A,
      );
    });
  });
});

describe('Conciliação — confirmação', () => {
  describe('1 e 15. Fluxo completo NF -> Conciliação -> Conta a Pagar', () => {
    it('vincula a nota à ordem e gera a conta a pagar', async () => {
      const { service, parcelas, tx } = makeService();

      await service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
        ...RECONCILE_BASE,
        purchaseOrderId: 'oc-compativel',
      });

      expect(tx.inboundInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseOrderId: 'oc-compativel',
            status: 'RECONCILED',
          }),
        }),
      );
      expect(parcelas).toHaveLength(1);
      expect(parcelas[0]).toMatchObject({ origin: 'INVOICE', constructionSiteId: OBRA });
    });

    it('a conta a pagar herda obra e centro de custo da ORDEM', async () => {
      const { service, parcelas } = makeService();

      await service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
        ...RECONCILE_BASE,
        purchaseOrderId: 'oc-compativel',
      });

      // É por aqui que a cadeia NF -> OC -> Solicitação -> Obra chega ao
      // Financeiro sem duplicar informação.
      expect(parcelas[0]).toMatchObject({ costCenterId: CENTRO, constructionSiteId: OBRA });
    });
  });

  describe('8 e 14. Nota já conciliada / idempotência', () => {
    it.each([['RECONCILED'], ['DIVERGENT']])('recusa conciliar nota %s', async (status) => {
      const { service } = makeService({ notaStatus: status });

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          purchaseOrderId: 'oc-compativel',
        }),
      ).rejects.toThrow(/já foi conciliada/);
    });

    it('9. nota já conciliada não gera segunda conta a pagar', async () => {
      const { service, parcelas } = makeService({ notaStatus: 'RECONCILED' });

      await service
        .reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          purchaseOrderId: 'oc-compativel',
        })
        .catch(() => undefined);

      expect(parcelas).toHaveLength(0);
    });

    it('nota cancelada não entra na conciliação', async () => {
      const { service } = makeService({ notaStatus: 'CANCELLED' });

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          purchaseOrderId: 'oc-compativel',
        }),
      ).rejects.toThrow(/cancelada/);
    });
  });

  describe('2 e 4. Divergência exige aceite e fica registrada', () => {
    it('recusa sem aceite quando o valor difere', async () => {
      const { service } = makeService({
        ordens: [
          {
            id: 'oc-valor-diferente',
            code: 'OC-0009',
            companyId: EMPRESA_A,
            supplierId: FORNECEDOR,
            totalAmount: d('2000.00'),
            issueDate: new Date('2026-08-15T00:00:00Z'),
            costCenterId: CENTRO,
            constructionSiteId: OBRA,
            supplier: {
              id: FORNECEDOR,
              legalName: 'F',
              tradeName: null,
              document: '12345678000190',
            },
            costCenter: null,
            constructionSite: null,
            items: [],
          },
        ],
      });

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          purchaseOrderId: 'oc-valor-diferente',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('17. a auditoria registra as divergências e o aceite', async () => {
      const { service, auditoria } = makeService();

      await service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
        ...RECONCILE_BASE,
        purchaseOrderId: 'oc-outros-itens',
        acceptDivergence: true,
      });

      const changes = auditoria[0]!.changes as Record<string, unknown>;
      expect(auditoria[0]).toMatchObject({ userId: USUARIO, entityType: 'InboundInvoice' });
      expect(changes.purchaseOrderCode).toBe('OC-0002');
      // A divergência de ITEM fica registrada mesmo sem bloquear.
      expect(changes.divergences as string[]).not.toHaveLength(0);
    });
  });

  describe('5 e 8. NF sem ordem de compra', () => {
    it('marca explicitamente como sem ordem na auditoria', async () => {
      const { service, auditoria, parcelas } = makeService();

      await service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
        ...RECONCILE_BASE,
        costCenterId: CENTRO,
      });

      const changes = auditoria[0]!.changes as Record<string, unknown>;
      // Explícito, e não deduzido de um campo nulo.
      expect(changes.withoutPurchaseOrder).toBe(true);
      expect(changes.purchaseOrderId).toBeNull();
      expect(parcelas).toHaveLength(1);
    });

    it('exige centro de custo — a despesa precisa de dono', async () => {
      const { service } = makeService();

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', RECONCILE_BASE),
      ).rejects.toThrow(/informe o centro de custo/);
    });

    it('12. centro de custo de outra empresa é recusado', async () => {
      const { service } = makeService();

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          costCenterId: 'cccccccc-0000-4000-8000-000000000099',
        }),
      ).rejects.toThrow(/Centro de custo informado não existe/);
    });
  });

  describe('3. Fornecedor diferente', () => {
    it('recusa ordem de outro fornecedor mesmo na escolha manual', async () => {
      const { service } = makeService({
        ordens: [
          {
            id: 'oc-outro-fornecedor',
            code: 'OC-0007',
            companyId: EMPRESA_A,
            supplierId: 'bbbbbbbb-0000-4000-8000-000000000001',
            totalAmount: d('1645.00'),
            issueDate: new Date('2026-08-15T00:00:00Z'),
            costCenterId: CENTRO,
            constructionSiteId: OBRA,
            supplier: { id: 'b', legalName: 'OUTRO', tradeName: null, document: '999' },
            costCenter: null,
            constructionSite: null,
            items: [],
          },
        ],
      });

      await expect(
        service.reconcile(EMPRESA_A, USUARIO, undefined, 'nota-1', {
          ...RECONCILE_BASE,
          purchaseOrderId: 'oc-outro-fornecedor',
        }),
      ).rejects.toThrow(/outro fornecedor/);
    });
  });
});

describe('13. Permissões (RBAC existente)', () => {
  const permissaoDe = (metodo: keyof InboundInvoicesController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, InboundInvoicesController.prototype[metodo]) as
      string[] | undefined;

  it('ver e comparar exigem apenas leitura', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, InboundInvoicesController)).toEqual([
      'financeiro.view',
    ]);
    expect(permissaoDe('compare')).toBeUndefined();
    expect(permissaoDe('suggestions')).toBeUndefined();
  });

  it('conciliar e marcar sem ordem exigem `financeiro.manage`', () => {
    expect(permissaoDe('reconcile')).toEqual(['financeiro.manage']);
  });

  it('nenhuma permissão nova foi criada nesta etapa', () => {
    const usadas = (['create', 'reconcile', 'cancel'] as const).flatMap(
      (metodo) => permissaoDe(metodo) ?? [],
    );
    expect(new Set(usadas)).toEqual(new Set(['financeiro.manage']));
  });
});
