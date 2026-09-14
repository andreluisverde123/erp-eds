import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { UpdateBudgetDto } from './dto/budget.dto';

/// ORC-05 no service de orçamento: BDI, base referencial, precificação na
/// data-base, revisão e orçamento oficial. Dublê enxuto, só com o que cada
/// fluxo toca; o comportamento do ORC-04 continua coberto em
/// `budgets.service.spec.ts`. Concorrência real (duas revisões ao mesmo tempo)
/// é conferida no Postgres — ver ORC_05_RESULT.md.

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '33333333-3333-4333-8333-333333333333';
const V1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const V2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const OBRA = 'aaaaaaaa-0000-4000-8000-000000000001';
const NO = 'cccccccc-0000-4000-8000-000000000001';

const D = (valor: string | number) => new Prisma.Decimal(valor);
const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);

interface Estado {
  status: 'DRAFT' | 'CLOSED';
  bdiPercent: Prisma.Decimal;
  bdiNote: string | null;
  currentBudgetId: string | null;
  ultimaVersao: { id: string; version: number; status: string } | null;
  obraExiste: boolean;
}

function makeService(inicial: Partial<Estado> = {}) {
  const estado: Estado = {
    status: 'DRAFT',
    bdiPercent: D(0),
    bdiNote: null,
    currentBudgetId: null,
    ultimaVersao: null,
    obraExiste: true,
    ...inicial,
  };
  const sqls: string[] = [];
  const criados: { item?: Record<string, unknown>; budget?: Record<string, unknown> } = {};
  const lotes: Record<string, unknown[]> = { nodes: [], items: [], components: [], referenceComponents: [] };

  const detalhe = (id: string) => ({
    id,
    companyId: EMPRESA,
    constructionSiteId: OBRA,
    code: 'ORC-0001',
    version: id === V2 ? 2 : 1,
    name: 'Orçamento',
    searchKey: 'orcamento',
    description: null,
    referenceDate: dia('2026-09-01'),
    status: estado.status,
    closedAt: null,
    closedById: null,
    createdById: USUARIO,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    bdiPercent: estado.bdiPercent,
    bdiNote: estado.bdiNote,
    revisedFromId: null,
    constructionSite: { id: OBRA, code: 'OBRA-01', name: 'Aurora', currentBudgetId: estado.currentBudgetId },
    createdBy: null,
    closedBy: null,
    revisedFrom: null,
    nodes: [],
    items: [],
  });

  const precos = [
    { id: 'p-bloco', catalogItemId: 'bloco', unitPrice: D('2'), unit: 'UN', referenceDate: dia('2026-08-20'), createdAt: new Date() },
    // Posterior à data-base de 01/09: nunca pode entrar.
    { id: 'p-pedreiro-futuro', catalogItemId: 'pedreiro', unitPrice: D('99'), unit: 'H', referenceDate: dia('2026-09-10'), createdAt: new Date() },
  ];

  const dataset = {
    id: 'ds',
    source: 'SINAPI' as const,
    competence: '2026-08',
    referenceDate: dia('2026-08-01'),
    uf: 'SP',
    locality: 'SAO PAULO',
    regime: 'NAO_DESONERADO' as const,
    versionLabel: '',
  };
  const composicaoDeReferencia = {
    id: 'rc-104658',
    code: '104658',
    description: 'PISO PODOTÁTIL',
    unit: 'M2',
    unitCost: D('208') as Prisma.Decimal | null,
    dataset,
    components: [
      { position: 0, section: null, kind: 'INPUT', code: '36178', description: 'PISO TATIL', unit: 'UN', coefficient: D('6.4375'), unitPrice: D('20.33'), totalCost: D('130.87'), situation: 'COM PREÇO', metadata: {} },
    ],
  };

  const prisma = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      sqls.push(sql);
      if (sql.includes('FROM "ConstructionSite"')) {
        return estado.obraExiste ? [{ id: OBRA, currentBudgetId: estado.currentBudgetId }] : [];
      }
      return [{ id: V1, code: 'ORC-0001', status: estado.status, version: 1, constructionSiteId: OBRA }];
    }),
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
    budget: {
      findFirst: jest.fn(async ({ where, include }: { where: { id?: string; code?: string }; include?: object }) => {
        if (where.code) return estado.ultimaVersao;
        return include ? detalhe(where.id!) : { id: where.id, referenceDate: dia('2026-09-01'), status: estado.status, code: 'ORC-0001' };
      }),
      findFirstOrThrow: jest.fn(async () => ({ referenceDate: dia('2026-09-01'), bdiPercent: estado.bdiPercent, bdiNote: estado.bdiNote })),
      findUniqueOrThrow: jest.fn(async () => ({
        ...detalhe(V1),
        nodes: [{ id: NO, budgetId: V1, parentId: null, name: 'Estrutura', position: 0, createdAt: new Date(), updatedAt: new Date() }],
        items: [],
      })),
      findMany: jest.fn(async () => [
        { id: V1, version: 1, status: 'CLOSED', closedAt: new Date(), createdAt: new Date(), revisedFromId: null, constructionSite: { currentBudgetId: V1 } },
        { id: V2, version: 2, status: 'DRAFT', closedAt: null, createdAt: new Date(), revisedFromId: V1, constructionSite: { currentBudgetId: V1 } },
      ]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        criados.budget = data;
        return data;
      }),
      update: jest.fn(async ({ data }: { data: { bdiPercent?: Prisma.Decimal; bdiNote?: string | null } }) => {
        if (data.bdiPercent !== undefined) estado.bdiPercent = data.bdiPercent;
        if (data.bdiNote !== undefined) estado.bdiNote = data.bdiNote;
        return {};
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    budgetNode: {
      findFirst: jest.fn(async () => ({ id: NO })),
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
        lotes.nodes!.push(...data);
        return { count: data.length };
      }),
    },
    budgetItem: {
      aggregate: jest.fn(async () => ({ _max: { position: null } })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        criados.item = data;
        return data;
      }),
      findMany: jest.fn(async () => [
        { id: 'i', budgetNodeId: NO, description: 'Item', source: 'MANUAL', quantity: D(1), unitCost: D(1), referenceCode: null, referenceKind: null, _count: { components: 0, referenceComponents: 0 } },
      ]),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
        lotes.items!.push(...data);
        return { count: data.length };
      }),
    },
    budgetItemComponent: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    budgetItemReferenceComponent: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    constructionSite: { update: jest.fn(async () => ({})) },
    composition: {
      findFirst: jest.fn(async () => ({
        id: 'comp',
        code: 'COMP-0001',
        name: 'Alvenaria',
        unit: 'M2',
        active: true,
        items: [
          { catalogItemId: 'bloco', coefficient: D('25'), unitPrice: D('1.5'), catalogItem: { code: 'MAT-0002', name: 'Bloco', type: 'MATERIAL', unit: 'UN' } },
          { catalogItemId: 'pedreiro', coefficient: D('0.8'), unitPrice: D('30'), catalogItem: { code: 'MO-0001', name: 'Pedreiro', type: 'LABOR', unit: 'H' } },
        ],
      })),
    },
    catalogItemPrice: {
      findMany: jest.fn(async ({ where }: { where: { catalogItemId: { in: string[] }; referenceDate: { lte: Date } } }) =>
        precos.filter((p) => where.catalogItemId.in.includes(p.catalogItemId) && p.referenceDate <= where.referenceDate.lte),
      ),
    },
    referenceItem: { findUnique: jest.fn(async () => null) },
    referenceComposition: { findUnique: jest.fn(async () => composicaoDeReferencia) },
  };

  const auditLogger = { log: jest.fn(async () => undefined) };
  const service = new BudgetsService(prisma as unknown as PrismaService, auditLogger as unknown as AuditLoggerService);
  return { service, prisma, auditLogger, estado, sqls, criados, lotes, composicaoDeReferencia, dataset };
}

describe('BDI', () => {
  it('rascunho: grava percentual e observação, audita de → para e devolve o preço final', async () => {
    const { service, auditLogger } = makeService();
    const orcamento = await service.update(EMPRESA, V1, { bdiPercent: '25', bdiNote: 'AC + lucro' });
    expect(orcamento).toMatchObject({ bdiPercent: '25.0000', bdiNote: 'AC + lucro', directCost: '0.00', finalPrice: '0.00' });
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Budget',
        action: 'UPDATE',
        changes: { bdiPercent: { from: '0.0000', to: '25.0000' }, bdiNote: { from: null, to: 'AC + lucro' } },
      }),
    );
  });

  it('fechado: recusado, nada gravado', async () => {
    const { service, prisma, auditLogger } = makeService({ status: 'CLOSED' });
    await expect(service.update(EMPRESA, V1, { bdiPercent: 10 })).rejects.toThrow(ConflictException);
    expect(prisma.budget.update).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it('o contrato recusa BDI negativo e com casas demais', async () => {
    const erros = async (bdiPercent: unknown) =>
      (await validate(plainToInstance(UpdateBudgetDto, { bdiPercent }))).map((e) => Object.values(e.constraints ?? {})[0]);
    expect(await erros(-1)).toEqual(['O BDI não pode ser negativo.']);
    expect(await erros('1.23456')).toEqual(['O BDI aceita até 4 casas decimais.']);
    expect(await erros(0)).toEqual([]);
  });

  it('o fechamento confere o BDI dentro da trava', async () => {
    const { service } = makeService({ bdiPercent: D(-1) });
    await expect(service.close(EMPRESA, V1, USUARIO)).rejects.toThrow(/BDI não pode ser negativo/);
  });
});

describe('Item de base referencial', () => {
  const dto = { budgetNodeId: NO, source: 'REFERENCE' as const, quantity: 10, referenceCompositionId: 'dddddddd-0000-4000-8000-000000000001' };

  it('snapshot com fonte, código, competência, UF, regime, custo e linhas analíticas', async () => {
    const { service, criados } = makeService();
    await service.addItem(EMPRESA, V1, dto);
    expect(criados.item).toMatchObject({
      source: 'REFERENCE',
      sourceCode: '104658',
      description: 'PISO PODOTÁTIL',
      unit: 'M2',
      unitCost: D('208'),
      referenceDatasetId: 'ds',
      referenceCompositionId: 'rc-104658',
      referenceItemId: null,
      referenceSource: 'SINAPI',
      referenceKind: 'COMPOSITION',
      referenceCode: '104658',
      referenceCompetence: '2026-08',
      referenceUf: 'SP',
      referenceLocality: 'SAO PAULO',
      referenceRegime: 'NAO_DESONERADO',
    });
    expect((criados.item!.referenceComponents as { create: object[] }).create).toEqual([
      expect.objectContaining({ code: '36178', coefficient: D('6.4375'), totalCost: D('130.87') }),
    ]);
  });

  it('custo é o publicado: não se informa e não se edita', async () => {
    const { service } = makeService();
    await expect(service.addItem(EMPRESA, V1, { ...dto, unitCost: 1 })).rejects.toThrow(/publicados pela base/);
  });

  it('competência posterior à data-base é recusada', async () => {
    const { service, composicaoDeReferencia } = makeService();
    composicaoDeReferencia.dataset.referenceDate = dia('2026-10-01');
    composicaoDeReferencia.dataset.competence = '2026-10';
    await expect(service.addItem(EMPRESA, V1, dto)).rejects.toThrow(/posterior à data-base/);
  });

  it('composição sem custo na referência é recusada', async () => {
    const { service, composicaoDeReferencia } = makeService();
    composicaoDeReferencia.unitCost = null;
    await expect(service.addItem(EMPRESA, V1, dto)).rejects.toThrow(/não tem custo nesta referência/);
  });

  it('exige insumo OU composição da base', async () => {
    const { service } = makeService();
    await expect(
      service.addItem(EMPRESA, V1, { ...dto, referenceItemId: 'dddddddd-0000-4000-8000-000000000002' }),
    ).rejects.toThrow(/insumo OU uma composição/);
  });

  it('o detalhe do orçamento não lê a base: nova importação não muda o item', async () => {
    const { service, prisma } = makeService();
    await service.findOne(EMPRESA, V1);
    const include = (prisma.budget.findFirst.mock.calls[0]![0] as { include: { items: { include: object } } }).include;
    expect(Object.keys(include.items.include)).toEqual(['components', 'referenceComponents']);
  });
});

describe('Composição própria na data-base', () => {
  it('usa o preço vigente na data-base e o da composição onde não há — MIXED; preço futuro é ignorado', async () => {
    const { service, criados, prisma } = makeService();
    await service.addItem(EMPRESA, V1, { budgetNodeId: NO, source: 'COMPOSITION', quantity: 1, compositionId: 'eeeeeeee-0000-4000-8000-000000000001' });

    expect(prisma.catalogItemPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ referenceDate: { lte: dia('2026-09-01') } }) }),
    );
    // 25 × 2,00 (histórico de 20/08) + 0,8 × 30,00 (fallback: o de 10/09 é futuro) = 74
    expect(criados.item).toMatchObject({ source: 'COMPOSITION', unitCost: D('74'), compositionPricing: 'MIXED' });
    expect((criados.item!.components as { create: object[] }).create).toEqual([
      expect.objectContaining({ code: 'MAT-0002', unitPrice: D('2'), priceOrigin: 'HISTORICAL', referencePriceId: 'p-bloco' }),
      expect.objectContaining({ code: 'MO-0001', unitPrice: D('30'), priceOrigin: 'FALLBACK', referencePriceId: null }),
    ]);
  });
});

describe('Revisão', () => {
  it('só de orçamento fechado', async () => {
    const { service, prisma } = makeService({ status: 'DRAFT' });
    await expect(service.revise(EMPRESA, V1, USUARIO)).rejects.toThrow(BadRequestException);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  it('só da versão mais recente', async () => {
    const { service, prisma } = makeService({ status: 'CLOSED', ultimaVersao: { id: V2, version: 2, status: 'DRAFT' } });
    await expect(service.revise(EMPRESA, V1, USUARIO)).rejects.toThrow('Já existe a versão v2 em rascunho');
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  it('trava a origem FOR UPDATE e cria v2 rascunho copiando BDI, data-base e EAP', async () => {
    const { service, sqls, criados, lotes, auditLogger } = makeService({
      status: 'CLOSED',
      bdiPercent: D('22.5'),
      bdiNote: 'nota',
      ultimaVersao: { id: V1, version: 1, status: 'CLOSED' },
    });
    await service.revise(EMPRESA, V1, USUARIO);

    expect(sqls[0]).toContain('FOR UPDATE');
    expect(criados.budget).toMatchObject({
      code: 'ORC-0001',
      version: 2,
      status: 'DRAFT',
      bdiPercent: D('22.5'),
      bdiNote: 'nota',
      referenceDate: dia('2026-09-01'),
      revisedFromId: V1,
      createdById: USUARIO,
    });
    expect(lotes.nodes).toEqual([expect.objectContaining({ name: 'Estrutura', budgetId: criados.budget!.id, parentId: null })]);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'Budget', changes: expect.objectContaining({ revisedFromId: V1, version: 2 }) }),
    );
  });

  it('corrida perdida na unique vira 409', async () => {
    const { service, prisma } = makeService({ status: 'CLOSED' });
    prisma.budget.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7' }));
    await expect(service.revise(EMPRESA, V1, USUARIO)).rejects.toThrow(ConflictException);
  });

  it('histórico de versões diz qual é a oficial', async () => {
    const { service } = makeService();
    expect((await service.versions(EMPRESA, V1)).map((v) => [v.version, v.status, v.isOfficial])).toEqual([
      [1, 'CLOSED', true],
      [2, 'DRAFT', false],
    ]);
  });
});

describe('Orçamento oficial', () => {
  it('só fechado', async () => {
    const { service, prisma } = makeService({ status: 'DRAFT' });
    await expect(service.setOfficial(EMPRESA, V1, USUARIO)).rejects.toThrow(/Só um orçamento fechado/);
    expect(prisma.constructionSite.update).not.toHaveBeenCalled();
  });

  it('de outra empresa: não encontrado', async () => {
    const { service, prisma } = makeService({ status: 'CLOSED' });
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.setOfficial(EMPRESA, V1, USUARIO)).rejects.toThrow(NotFoundException);
  });

  it('troca explícita: trava a obra, grava e audita de → para', async () => {
    const { service, prisma, sqls, auditLogger } = makeService({ status: 'CLOSED', currentBudgetId: V2 });
    await service.setOfficial(EMPRESA, V1, USUARIO);
    expect(sqls[0]).toContain('FOR SHARE');
    expect(sqls[1]).toContain('FOR UPDATE');
    expect(prisma.constructionSite.update).toHaveBeenCalledWith({ where: { id: OBRA }, data: { currentBudgetId: V1 } });
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ changes: expect.objectContaining({ officialForSite: { from: V2, to: V1 } }) }),
    );
  });

  it('já oficial: nada muda e nada é auditado', async () => {
    const { service, prisma, auditLogger } = makeService({ status: 'CLOSED', currentBudgetId: V1 });
    const orcamento = await service.setOfficial(EMPRESA, V1, USUARIO);
    expect(orcamento.isOfficial).toBe(true);
    expect(prisma.constructionSite.update).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });
});
