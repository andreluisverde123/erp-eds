import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CatalogItemPricesService } from './catalog-item-prices.service';
import { latestReferencePrices } from './latest-prices';
import { todayIn } from './reference-date';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-4222-8222-222222222222';
const USUARIO = '33333333-3333-4333-8333-333333333333';

const CIMENTO = 'cccccccc-0000-4000-8000-000000000001';
const PEDREIRO = 'cccccccc-0000-4000-8000-000000000002';
const BETONEIRA = 'cccccccc-0000-4000-8000-000000000003';
const EXCLUIDO = 'cccccccc-0000-4000-8000-000000000004';
const DA_OUTRA = 'cccccccc-0000-4000-8000-000000000005';

const ORDEM = 'dddddddd-0000-4000-8000-000000000001';
const LINHA_CIMENTO = 'eeeeeeee-0000-4000-8000-000000000001';
const LINHA_EM_KG = 'eeeeeeee-0000-4000-8000-000000000002';
const LINHA_DA_OUTRA = 'eeeeeeee-0000-4000-8000-000000000003';

interface Insumo {
  id: string;
  companyId: string;
  unit: string;
  type: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  deletedAt: Date | null;
}

interface Preco {
  id: string;
  companyId: string;
  catalogItemId: string;
  unitPrice: Prisma.Decimal;
  unit: string;
  source: 'MANUAL' | 'PURCHASE';
  referenceDate: Date;
  note: string | null;
  purchaseOrderId: string | null;
  purchaseOrderItemId: string | null;
  createdById: string | null;
  createdAt: Date;
}

interface LinhaDeCompra {
  id: string;
  description: string;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;
  purchaseRequestItem: { catalogItemId: string | null };
  purchaseOrder: {
    id: string;
    companyId: string;
    deletedAt: Date | null;
    code: string;
    status: string;
    issueDate: Date;
    totalAmount: Prisma.Decimal;
    supplier: { legalName: string; tradeName: string | null };
    items: { totalPrice: Prisma.Decimal }[];
  };
}

const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);
const D = (valor: string) => new Prisma.Decimal(valor);

function catalogo(): Insumo[] {
  return [
    { id: CIMENTO, companyId: EMPRESA, unit: 'SC', type: 'MATERIAL', deletedAt: null },
    { id: PEDREIRO, companyId: EMPRESA, unit: 'H', type: 'LABOR', deletedAt: null },
    { id: BETONEIRA, companyId: EMPRESA, unit: 'H', type: 'EQUIPMENT', deletedAt: null },
    { id: EXCLUIDO, companyId: EMPRESA, unit: 'M3', type: 'MATERIAL', deletedAt: new Date() },
    { id: DA_OUTRA, companyId: OUTRA_EMPRESA, unit: 'SC', type: 'MATERIAL', deletedAt: null },
  ];
}

function ordem(extra: Partial<LinhaDeCompra['purchaseOrder']> = {}): LinhaDeCompra['purchaseOrder'] {
  return {
    id: ORDEM,
    companyId: EMPRESA,
    deletedAt: null,
    code: 'OC-0007',
    status: 'RECEIVED',
    issueDate: dia('2026-09-10'),
    // 100 SC × 40,00 + 50 KG × 2,00 = 4.100; desconto geral de 410 (10%).
    totalAmount: D('3690.00'),
    supplier: { legalName: 'Depósito Silva Ltda', tradeName: 'Depósito Silva' },
    items: [{ totalPrice: D('4000.00') }, { totalPrice: D('100.00') }],
    ...extra,
  };
}

function comprasPadrao(): LinhaDeCompra[] {
  return [
    {
      id: LINHA_CIMENTO,
      description: 'Cimento CP II 50kg',
      quantity: D('100'),
      unit: 'SC',
      unitPrice: D('40.00'),
      totalPrice: D('4000.00'),
      purchaseRequestItem: { catalogItemId: CIMENTO },
      purchaseOrder: ordem(),
    },
    {
      id: LINHA_EM_KG,
      description: 'Cimento a granel',
      quantity: D('50'),
      unit: 'KG',
      unitPrice: D('2.00'),
      totalPrice: D('100.00'),
      purchaseRequestItem: { catalogItemId: CIMENTO },
      purchaseOrder: ordem(),
    },
    {
      id: LINHA_DA_OUTRA,
      description: 'Cimento',
      quantity: D('10'),
      unit: 'SC',
      unitPrice: D('40.00'),
      totalPrice: D('400.00'),
      purchaseRequestItem: { catalogItemId: CIMENTO },
      purchaseOrder: ordem({ companyId: OUTRA_EMPRESA, items: [{ totalPrice: D('400.00') }], totalAmount: D('400.00') }),
    },
  ];
}

function preco(extra: Partial<Preco>): Preco {
  return {
    id: `ffffffff-0000-4000-8000-${Math.random().toString().slice(2, 14).padEnd(12, '0')}`,
    companyId: EMPRESA,
    catalogItemId: CIMENTO,
    unitPrice: D('38.0000'),
    unit: 'SC',
    source: 'MANUAL',
    referenceDate: dia('2026-09-01'),
    note: null,
    purchaseOrderId: null,
    purchaseOrderItemId: null,
    createdById: USUARIO,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    ...extra,
  };
}

/// O mais recente primeiro: data de referência e, no empate, cadastro.
const maisRecentePrimeiro = (a: Preco, b: Preco) =>
  b.referenceDate.getTime() - a.referenceDate.getTime() ||
  b.createdAt.getTime() - a.createdAt.getTime();

/// Dublê COM ESTADO do histórico. O filtro de data e a ordenação são
/// reproduzidos, então os testes de regra temporal provam o comportamento — e
/// não só o formato da consulta.
function makeService(estado: { precos?: Preco[]; compras?: LinhaDeCompra[] } = {}) {
  const insumos = catalogo();
  const precos = estado.precos ?? [];
  const compras = estado.compras ?? comprasPadrao();
  let relogio = Date.parse('2026-09-14T15:00:00.000Z');

  type Where = {
    companyId?: string;
    catalogItemId?: string | { in: string[] };
    referenceDate?: { lte: Date };
    purchaseOrderItemId?: { in: string[] };
  };

  const filtrar = (where: Where) =>
    precos
      .filter((p) => where.companyId === undefined || p.companyId === where.companyId)
      .filter((p) =>
        where.catalogItemId === undefined
          ? true
          : typeof where.catalogItemId === 'string'
            ? p.catalogItemId === where.catalogItemId
            : where.catalogItemId.in.includes(p.catalogItemId),
      )
      .filter((p) => !where.referenceDate || p.referenceDate <= where.referenceDate.lte)
      .filter(
        (p) => !where.purchaseOrderItemId || where.purchaseOrderItemId.in.includes(p.purchaseOrderItemId ?? ''),
      )
      .sort(maisRecentePrimeiro);

  const apresentavel = (p: Preco) => ({
    ...p,
    createdBy: p.createdById ? { name: 'Engenheira Ana' } : null,
    purchaseOrder: p.purchaseOrderId ? { id: p.purchaseOrderId, code: 'OC-0007' } : null,
  });

  const catalogItemPrice = {
    findMany: jest.fn(async ({ where, skip = 0, take }: { where: Where; skip?: number; take?: number }) =>
      filtrar(where)
        .slice(skip, take === undefined ? undefined : skip + take)
        .map(apresentavel),
    ),
    findFirst: jest.fn(async ({ where }: { where: Where }) => {
      const achado = filtrar(where)[0];
      return achado ? apresentavel(achado) : null;
    }),
    count: jest.fn(async ({ where }: { where: Where }) => filtrar(where).length),
    create: jest.fn(async ({ data }: { data: Omit<Preco, 'id' | 'createdAt'> }) => {
      if (data.purchaseOrderItemId && precos.some((p) => p.purchaseOrderItemId === data.purchaseOrderItemId)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7' });
      }
      relogio += 1000;
      const novo = preco({ ...data, createdAt: new Date(relogio) });
      precos.push(novo);
      return apresentavel(novo);
    }),
  };

  const catalogItem = {
    findFirst: jest.fn(async ({ where }: { where: { id: string; companyId: string } }) => {
      const achado = insumos.find(
        (i) => i.id === where.id && i.companyId === where.companyId && i.deletedAt === null,
      );
      return achado ? { id: achado.id, unit: achado.unit } : null;
    }),
  };

  type WhereCompra = {
    id?: string;
    purchaseRequestItem?: { catalogItemId: string };
    purchaseOrder: { companyId: string; deletedAt: null; status?: string };
  };
  const filtrarCompras = (where: WhereCompra) =>
    compras.filter(
      (l) =>
        (where.id === undefined || l.id === where.id) &&
        (!where.purchaseRequestItem || l.purchaseRequestItem.catalogItemId === where.purchaseRequestItem.catalogItemId) &&
        l.purchaseOrder.companyId === where.purchaseOrder.companyId &&
        l.purchaseOrder.deletedAt === null &&
        (where.purchaseOrder.status === undefined || l.purchaseOrder.status === where.purchaseOrder.status),
    );

  const purchaseOrderItem = {
    findMany: jest.fn(async ({ where }: { where: WhereCompra }) => filtrarCompras(where)),
    findFirst: jest.fn(async ({ where }: { where: WhereCompra }) => filtrarCompras(where)[0] ?? null),
  };

  const prisma = {
    catalogItem,
    catalogItemPrice,
    purchaseOrderItem,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  return { service: new CatalogItemPricesService(prisma), prisma, precos, catalogItemPrice, purchaseOrderItem };
}

const manual = (unitPrice: number | string, referenceDate: string, note?: string) => ({
  unitPrice,
  referenceDate,
  note,
});

describe('Registrar preço MANUAL', () => {
  it('grava valor, unidade do insumo, origem, data, observação, autor e a empresa da SESSÃO', async () => {
    const { service, precos } = makeService();

    const resposta = await service.registerManual(EMPRESA, USUARIO, CIMENTO, {
      ...manual('38.75', '2026-09-10', 'Cotação por telefone'),
      companyId: OUTRA_EMPRESA,
    } as never);

    expect(precos).toHaveLength(1);
    expect(precos[0]).toMatchObject({
      companyId: EMPRESA,
      catalogItemId: CIMENTO,
      unit: 'SC',
      source: 'MANUAL',
      note: 'Cotação por telefone',
      createdById: USUARIO,
      purchaseOrderId: null,
    });
    expect(resposta).toMatchObject({
      unitPrice: '38.7500',
      unit: 'SC',
      source: 'MANUAL',
      referenceDate: '2026-09-10',
    });
  });

  it('guarda quatro casas decimais sem arredondar', async () => {
    const { service, precos } = makeService();

    const resposta = await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual('0.0615', '2026-09-10'));

    expect(precos[0]!.unitPrice.toString()).toBe('0.0615');
    expect(resposta.unitPrice).toBe('0.0615');
  });

  it.each([
    ['MATERIAL', CIMENTO, 'SC'],
    ['LABOR', PEDREIRO, 'H'],
    ['EQUIPMENT', BETONEIRA, 'H'],
  ])('%s tem preço de referência na unidade dele', async (_natureza, insumo, unidade) => {
    const { service } = makeService();

    const resposta = await service.registerManual(EMPRESA, USUARIO, insumo, manual(30, '2026-09-10'));

    expect(resposta.unit).toBe(unidade);
  });

  it('preço negativo é recusado, e nada é gravado', async () => {
    const { service, precos } = makeService();

    await expect(
      service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(-1, '2026-09-10')),
    ).rejects.toThrow(/negativo/);
    expect(precos).toHaveLength(0);
  });

  it('mais de quatro casas é recusado', async () => {
    const { service, precos } = makeService();

    await expect(
      service.registerManual(EMPRESA, USUARIO, CIMENTO, manual('38.12345', '2026-09-10')),
    ).rejects.toThrow(/4 casas/);
    expect(precos).toHaveLength(0);
  });

  it('data de referência FUTURA é recusada', async () => {
    const { service, precos } = makeService();
    const amanha = new Date(Date.now() + 36 * 3600 * 1000);

    await expect(
      service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(40, todayIn('America/Sao_Paulo', amanha))),
    ).rejects.toThrow(/futura/);
    expect(precos).toHaveLength(0);
  });

  it('hoje é aceito', async () => {
    const { service } = makeService();

    const resposta = await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(40, todayIn()));

    expect(resposta.referenceDate).toBe(todayIn());
  });

  it('data inexistente é recusada', async () => {
    const { service } = makeService();

    await expect(
      service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(40, '2026-02-30')),
    ).rejects.toThrow(BadRequestException);
  });

  it('insumo de OUTRA empresa dá "não encontrado", e nada é gravado', async () => {
    const { service, precos } = makeService();

    await expect(
      service.registerManual(EMPRESA, USUARIO, DA_OUTRA, manual(40, '2026-09-10')),
    ).rejects.toThrow(NotFoundException);
    expect(precos).toHaveLength(0);
  });

  it('insumo excluído dá "não encontrado"', async () => {
    const { service } = makeService();

    await expect(
      service.registerManual(EMPRESA, USUARIO, EXCLUIDO, manual(90, '2026-09-10')),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('Histórico', () => {
  it('um preço novo NÃO sobrescreve o anterior — acrescenta', async () => {
    const { service, precos, catalogItemPrice } = makeService();

    await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(38, '2026-09-01'));
    await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual(42, '2026-09-10'));

    expect(precos.map((p) => p.unitPrice.toString())).toEqual(['38', '42']);
    expect(catalogItemPrice).not.toHaveProperty('update');
    expect(catalogItemPrice).not.toHaveProperty('upsert');
    expect(catalogItemPrice).not.toHaveProperty('delete');
  });

  it('o service não tem como editar nem excluir preço', () => {
    const metodos = Object.getOwnPropertyNames(CatalogItemPricesService.prototype);

    expect(metodos.filter((m) => /update|edit|remove|delete|replace/i.test(m))).toEqual([]);
  });

  it('lista do mais recente para o mais antigo, com origem, data e autor', async () => {
    const { service } = makeService({
      precos: [
        preco({ unitPrice: D('35'), referenceDate: dia('2026-07-01') }),
        preco({ unitPrice: D('42'), referenceDate: dia('2026-09-10') }),
        preco({ unitPrice: D('38'), referenceDate: dia('2026-08-15'), source: 'PURCHASE', purchaseOrderId: ORDEM, purchaseOrderItemId: LINHA_CIMENTO }),
      ],
    });

    const pagina = await service.history(EMPRESA, CIMENTO, { page: 1, limit: 10 });

    expect(pagina.data.map((p) => [p.referenceDate, p.unitPrice, p.source])).toEqual([
      ['2026-09-10', '42.0000', 'MANUAL'],
      ['2026-08-15', '38.0000', 'PURCHASE'],
      ['2026-07-01', '35.0000', 'MANUAL'],
    ]);
    expect(pagina.data[1]!.purchaseOrder).toEqual({ id: ORDEM, code: 'OC-0007' });
    expect(pagina.data[0]!.createdBy).toEqual({ name: 'Engenheira Ana' });
    expect(pagina.meta.total).toBe(3);
  });

  it('o histórico só traz preços da empresa da sessão', async () => {
    const { service, catalogItemPrice } = makeService({
      precos: [preco({}), preco({ companyId: OUTRA_EMPRESA })],
    });

    const pagina = await service.history(EMPRESA, CIMENTO, { page: 1, limit: 10 });

    expect(pagina.data).toHaveLength(1);
    expect(catalogItemPrice.findMany.mock.calls[0]![0].where).toMatchObject({ companyId: EMPRESA });
  });

  it('histórico de insumo de OUTRA empresa dá "não encontrado"', async () => {
    const { service, catalogItemPrice } = makeService({
      precos: [preco({ companyId: OUTRA_EMPRESA, catalogItemId: DA_OUTRA })],
    });

    await expect(service.history(EMPRESA, DA_OUTRA, { page: 1, limit: 10 })).rejects.toThrow(
      NotFoundException,
    );
    expect(catalogItemPrice.findMany).not.toHaveBeenCalled();
  });
});

describe('Regra temporal', () => {
  const historico = () => [
    preco({ unitPrice: D('35.0000'), referenceDate: dia('2026-07-01') }),
    preco({ unitPrice: D('38.0000'), referenceDate: dia('2026-08-20') }),
    preco({ unitPrice: D('42.0000'), referenceDate: dia('2026-09-10') }),
  ];

  it('o preço em 01/09 é o mais recente com data até 01/09', async () => {
    const { service } = makeService({ precos: historico() });

    const resposta = await service.priceAt(EMPRESA, CIMENTO, '2026-09-01');

    expect(resposta).toMatchObject({
      asOf: '2026-09-01',
      unit: 'SC',
      price: { unitPrice: '38.0000', referenceDate: '2026-08-20', source: 'MANUAL' },
    });
  });

  it('um preço FUTURO nunca é usado para uma data anterior', async () => {
    // Em 01/09 ninguém sabia dos R$ 42,00 de 10/09.
    const { service } = makeService({ precos: historico() });

    const em0109 = await service.priceAt(EMPRESA, CIMENTO, '2026-09-01');
    const em0907 = await service.priceAt(EMPRESA, CIMENTO, '2026-09-09');

    expect(em0109.price!.unitPrice).not.toBe('42.0000');
    expect(em0907.price!.unitPrice).toBe('38.0000');
  });

  it('a própria data de referência já vale', async () => {
    const { service } = makeService({ precos: historico() });

    expect((await service.priceAt(EMPRESA, CIMENTO, '2026-09-10')).price!.unitPrice).toBe('42.0000');
  });

  it('antes do primeiro preço, não há preço', async () => {
    const { service } = makeService({ precos: historico() });

    expect((await service.priceAt(EMPRESA, CIMENTO, '2026-06-30')).price).toBeNull();
  });

  it('sem data, é o preço vigente HOJE — o mais recente', async () => {
    const { service } = makeService({ precos: historico() });

    const resposta = await service.priceAt(EMPRESA, CIMENTO);

    expect(resposta.asOf).toBe(todayIn());
    expect(resposta.price!.unitPrice).toBe('42.0000');
  });

  it('sem data, um preço registrado com data posterior a hoje não é o vigente', async () => {
    // Não é possível registrar data futura pela API, mas uma origem futura
    // (importação) poderia trazer. A regra não depende da validação de entrada.
    const { service } = makeService({
      precos: [...historico(), preco({ unitPrice: D('99'), referenceDate: dia('2999-01-01') })],
    });

    expect((await service.priceAt(EMPRESA, CIMENTO)).price!.unitPrice).toBe('42.0000');
  });

  it('dois preços na MESMA data: vale o registrado por último', async () => {
    const { service } = makeService();

    await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual('387.50', '2026-09-10', 'digitado errado'));
    await service.registerManual(EMPRESA, USUARIO, CIMENTO, manual('38.75', '2026-09-10', 'correção'));

    const resposta = await service.priceAt(EMPRESA, CIMENTO, '2026-09-10');
    expect(resposta.price).toMatchObject({ unitPrice: '38.7500', note: 'correção' });
    const pagina = await service.history(EMPRESA, CIMENTO, { page: 1, limit: 10 });
    expect(pagina.data).toHaveLength(2);
  });

  it('preço de outra empresa nunca é o vigente', async () => {
    const { service } = makeService({
      precos: [preco({ companyId: OUTRA_EMPRESA, unitPrice: D('1'), referenceDate: dia('2026-09-12') })],
    });

    expect((await service.priceAt(EMPRESA, CIMENTO, '2026-09-13')).price).toBeNull();
  });

  it('vigente de vários insumos numa consulta: cada um o seu, sem futuro', async () => {
    const { prisma, catalogItemPrice } = makeService({
      precos: [
        ...historico(),
        preco({ catalogItemId: PEDREIRO, unit: 'H', unitPrice: D('30'), referenceDate: dia('2026-08-01') }),
      ],
    });

    const vigentes = await latestReferencePrices(prisma, EMPRESA, [CIMENTO, PEDREIRO, BETONEIRA], '2026-09-01');

    expect(vigentes.get(CIMENTO)).toEqual({
      unitPrice: '38.0000',
      unit: 'SC',
      referenceDate: '2026-08-20',
      source: 'MANUAL',
    });
    expect(vigentes.get(PEDREIRO)?.unitPrice).toBe('30.0000');
    expect(vigentes.has(BETONEIRA)).toBe(false);
    expect(catalogItemPrice.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('Origem PURCHASE', () => {
  it('lista só linhas de ordens RECEBIDAS, da empresa, ligadas ao insumo, com o preço praticado', async () => {
    const { service, purchaseOrderItem } = makeService();

    const candidatas = await service.purchaseCandidates(EMPRESA, CIMENTO);

    expect(purchaseOrderItem.findMany.mock.calls[0]![0].where).toEqual({
      purchaseRequestItem: { catalogItemId: CIMENTO },
      purchaseOrder: { companyId: EMPRESA, deletedAt: null, status: 'RECEIVED' },
    });
    // A linha de outra empresa não aparece.
    expect(candidatas.map((c) => c.purchaseOrderItemId)).toEqual([LINHA_CIMENTO, LINHA_EM_KG]);
    // 4.000 × (3.690 ÷ 4.100) ÷ 100 = 36,00: o desconto geral de 10% rateado.
    expect(candidatas[0]).toMatchObject({
      purchaseOrder: { code: 'OC-0007', supplierName: 'Depósito Silva' },
      unit: 'SC',
      listUnitPrice: '40.00',
      practicedUnitPrice: '36.0000',
      referenceDate: '2026-09-10',
      block: null,
    });
    expect(candidatas[1]).toMatchObject({ unit: 'KG', block: 'UNIT_MISMATCH' });
  });

  it('registrar grava o preço praticado, a data de emissão e de qual compra veio', async () => {
    const { service, precos } = makeService();

    const resposta = await service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, {
      purchaseOrderItemId: LINHA_CIMENTO,
    });

    expect(precos[0]).toMatchObject({
      source: 'PURCHASE',
      unit: 'SC',
      purchaseOrderId: ORDEM,
      purchaseOrderItemId: LINHA_CIMENTO,
      createdById: USUARIO,
      companyId: EMPRESA,
    });
    expect(resposta).toMatchObject({
      unitPrice: '36.0000',
      referenceDate: '2026-09-10',
      purchaseOrder: { code: 'OC-0007' },
    });
  });

  it('a mesma linha não vira dois preços', async () => {
    const { service, precos } = makeService();
    await service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO });

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO }),
    ).rejects.toThrow(ConflictException);
    expect(precos).toHaveLength(1);

    const candidatas = await service.purchaseCandidates(EMPRESA, CIMENTO);
    expect(candidatas[0]!.block).toBe('ALREADY_REGISTERED');
  });

  it('linha em unidade diferente da do insumo é recusada', async () => {
    const { service, precos } = makeService();

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_EM_KG }),
    ).rejects.toThrow(/unidade diferente/);
    expect(precos).toHaveLength(0);
  });

  it('ordem que não está RECEBIDA é recusada', async () => {
    const compras = comprasPadrao();
    compras[0]!.purchaseOrder.status = 'ISSUED';
    const { service, precos } = makeService({ compras });

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO }),
    ).rejects.toThrow(/RECEBIDA/);
    expect(precos).toHaveLength(0);
  });

  it('linha de compra de OUTRA empresa é recusada', async () => {
    const { service, purchaseOrderItem, precos } = makeService();

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_DA_OUTRA }),
    ).rejects.toThrow(/não encontrada/);
    expect(purchaseOrderItem.findFirst.mock.calls[0]![0].where.purchaseOrder).toEqual({
      companyId: EMPRESA,
      deletedAt: null,
    });
    expect(precos).toHaveLength(0);
  });

  it('linha ligada a OUTRO insumo é recusada', async () => {
    const compras = comprasPadrao();
    compras[0]!.purchaseRequestItem.catalogItemId = PEDREIRO;
    const { service } = makeService({ compras });

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO }),
    ).rejects.toThrow(/não está ligada a este insumo/);
  });

  it('linha sem insumo (texto livre) é recusada', async () => {
    const compras = comprasPadrao();
    compras[0]!.purchaseRequestItem.catalogItemId = null;
    const { service } = makeService({ compras });

    await expect(
      service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO }),
    ).rejects.toThrow(BadRequestException);
  });

  it('o preço de compra entra na regra temporal como qualquer outro', async () => {
    const { service } = makeService({
      precos: [preco({ unitPrice: D('35'), referenceDate: dia('2026-08-01') })],
    });
    await service.registerFromPurchase(EMPRESA, USUARIO, CIMENTO, { purchaseOrderItemId: LINHA_CIMENTO });

    expect((await service.priceAt(EMPRESA, CIMENTO, '2026-09-09')).price!.unitPrice).toBe('35.0000');
    expect((await service.priceAt(EMPRESA, CIMENTO, '2026-09-10')).price).toMatchObject({
      unitPrice: '36.0000',
      source: 'PURCHASE',
    });
  });
});
