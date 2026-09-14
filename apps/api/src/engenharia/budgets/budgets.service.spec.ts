import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService } from './budgets.service';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-4222-8222-222222222222';
const USUARIO = '33333333-3333-4333-8333-333333333333';

const OBRA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OBRA_DA_OUTRA = 'aaaaaaaa-0000-4000-8000-000000000002';
const OBRA_EXCLUIDA = 'aaaaaaaa-0000-4000-8000-000000000003';

const ALVENARIA = 'bbbbbbbb-0000-4000-8000-000000000001';
const COMPOSICAO_INATIVA = 'bbbbbbbb-0000-4000-8000-000000000002';
const COMPOSICAO_VAZIA = 'bbbbbbbb-0000-4000-8000-000000000003';
const COMPOSICAO_DA_OUTRA = 'bbbbbbbb-0000-4000-8000-000000000004';

const TAPUME = 'cccccccc-0000-4000-8000-000000000001';
const BLOCO = 'cccccccc-0000-4000-8000-000000000002';
const PEDREIRO = 'cccccccc-0000-4000-8000-000000000003';
const INSUMO_INATIVO = 'cccccccc-0000-4000-8000-000000000004';
const INSUMO_DA_OUTRA = 'cccccccc-0000-4000-8000-000000000005';

const D = (valor: string | number) => new Prisma.Decimal(valor);
const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);

interface Orcamento {
  id: string;
  companyId: string;
  constructionSiteId: string;
  code: string;
  version: number;
  name: string;
  searchKey: string;
  description: string | null;
  referenceDate: Date;
  status: 'DRAFT' | 'CLOSED';
  closedAt: Date | null;
  closedById: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface No {
  id: string;
  budgetId: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Item {
  id: string;
  budgetId: string;
  budgetNodeId: string;
  position: number;
  source: string;
  compositionId: string | null;
  catalogItemId: string | null;
  referencePriceId: string | null;
  sourceCode: string | null;
  catalogItemType: string | null;
  description: string;
  unit: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}

interface Componente {
  id: string;
  budgetItemId: string;
  catalogItemId: string;
  code: string;
  name: string;
  type: string;
  unit: string;
  coefficient: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  position: number;
}

interface LinhaDeComposicao {
  catalogItemId: string;
  coefficient: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  createdAt: Date;
  catalogItem: { code: string; name: string; type: string; unit: string };
}

interface Composicao {
  id: string;
  companyId: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  deletedAt: Date | null;
  items: LinhaDeComposicao[];
}

interface Insumo {
  id: string;
  companyId: string;
  code: string;
  name: string;
  unit: string;
  type: string;
  active: boolean;
  deletedAt: Date | null;
}

interface Preco {
  id: string;
  companyId: string;
  catalogItemId: string;
  unitPrice: Prisma.Decimal;
  unit: string;
  source: string;
  referenceDate: Date;
  createdAt: Date;
}

/// Filtro do dublê: igualdade, `in` e `lte`. Relações e `OR` são ignorados — os
/// testes que dependem deles conferem a CONSULTA, não o resultado.
function casa(registro: object, where: object = {}): boolean {
  return Object.entries(where).every(([campo, esperado]) => {
    if (esperado === undefined) return true;
    const atual = (registro as Record<string, unknown>)[campo];
    if (esperado !== null && typeof esperado === 'object' && !(esperado instanceof Date)) {
      const condicao = esperado as { in?: unknown[]; lte?: Date };
      if (condicao.in) return condicao.in.includes(atual);
      if (condicao.lte) return (atual as Date).getTime() <= condicao.lte.getTime();
      return true;
    }
    return atual === esperado;
  });
}

const violacaoDeUnique = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7' });
const violacaoDeFk = () =>
  new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: '7' });

function linhaDeComposicao(catalogItemId: string, code: string, name: string, type: string, unit: string, coefficient: string, unitPrice: string, ms: number): LinhaDeComposicao {
  return {
    catalogItemId,
    coefficient: D(coefficient),
    unitPrice: D(unitPrice),
    createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, 0, ms)),
    catalogItem: { code, name, type, unit },
  };
}

function makeService() {
  let sequencia = 0;
  const novoId = () => `99999999-0000-4000-8000-${String(++sequencia).padStart(12, '0')}`;
  const agora = () => new Date(Date.UTC(2026, 8, 14, 12, 0, 0, sequencia));
  const aplicar = (alvo: object, data: object) =>
    Object.entries(data).forEach(([campo, valor]) => {
      if (valor !== undefined) Object.assign(alvo, { [campo]: valor });
    });

  const obras = [
    { id: OBRA, companyId: EMPRESA, code: 'OBRA-01', name: 'Residencial Aurora', status: 'IN_PROGRESS', deletedAt: null as Date | null },
    { id: OBRA_DA_OUTRA, companyId: OUTRA_EMPRESA, code: 'OBRA-01', name: 'Da concorrente', status: 'IN_PROGRESS', deletedAt: null as Date | null },
    { id: OBRA_EXCLUIDA, companyId: EMPRESA, code: 'OBRA-02', name: 'Excluída', status: 'CANCELLED', deletedAt: new Date() as Date | null },
  ];

  const insumos: Insumo[] = [
    { id: TAPUME, companyId: EMPRESA, code: 'MAT-0001', name: 'Tapume provisório', unit: 'M2', type: 'MATERIAL', active: true, deletedAt: null },
    { id: BLOCO, companyId: EMPRESA, code: 'MAT-0002', name: 'Bloco cerâmico', unit: 'UN', type: 'MATERIAL', active: true, deletedAt: null },
    { id: PEDREIRO, companyId: EMPRESA, code: 'MO-0001', name: 'Pedreiro', unit: 'H', type: 'LABOR', active: true, deletedAt: null },
    { id: INSUMO_INATIVO, companyId: EMPRESA, code: 'MAT-0003', name: 'Cal', unit: 'SC', type: 'MATERIAL', active: false, deletedAt: null },
    { id: INSUMO_DA_OUTRA, companyId: OUTRA_EMPRESA, code: 'MAT-0001', name: 'Tapume', unit: 'M2', type: 'MATERIAL', active: true, deletedAt: null },
  ];

  const composicoes: Composicao[] = [
    {
      id: ALVENARIA,
      companyId: EMPRESA,
      code: 'COMP-0001',
      name: 'Alvenaria de vedação',
      unit: 'M2',
      active: true,
      deletedAt: null,
      // 25 × 1,50 + 0,8 × 30 = 61,50 por M2.
      items: [
        linhaDeComposicao(BLOCO, 'MAT-0002', 'Bloco cerâmico', 'MATERIAL', 'UN', '25', '1.5', 1),
        linhaDeComposicao(PEDREIRO, 'MO-0001', 'Pedreiro', 'LABOR', 'H', '0.8', '30', 2),
      ],
    },
    { id: COMPOSICAO_INATIVA, companyId: EMPRESA, code: 'COMP-0002', name: 'Antiga', unit: 'M2', active: false, deletedAt: null, items: [linhaDeComposicao(BLOCO, 'MAT-0002', 'Bloco', 'MATERIAL', 'UN', '1', '1', 1)] },
    { id: COMPOSICAO_VAZIA, companyId: EMPRESA, code: 'COMP-0003', name: 'Sem insumos', unit: 'M3', active: true, deletedAt: null, items: [] },
    { id: COMPOSICAO_DA_OUTRA, companyId: OUTRA_EMPRESA, code: 'COMP-0001', name: 'Da concorrente', unit: 'M2', active: true, deletedAt: null, items: [linhaDeComposicao(BLOCO, 'MAT-0002', 'Bloco', 'MATERIAL', 'UN', '1', '1', 1)] },
  ];

  const precos: Preco[] = [
    { id: 'p-0801', companyId: EMPRESA, catalogItemId: TAPUME, unitPrice: D('40'), unit: 'M2', source: 'MANUAL', referenceDate: dia('2026-08-01'), createdAt: new Date('2026-08-01T12:00:00Z') },
    { id: 'p-0820', companyId: EMPRESA, catalogItemId: TAPUME, unitPrice: D('45'), unit: 'M2', source: 'MANUAL', referenceDate: dia('2026-08-20'), createdAt: new Date('2026-08-20T12:00:00Z') },
    // Posterior à data-base de 01/09: nunca pode ser usado.
    { id: 'p-0910', companyId: EMPRESA, catalogItemId: TAPUME, unitPrice: D('52'), unit: 'M2', source: 'MANUAL', referenceDate: dia('2026-09-10'), createdAt: new Date('2026-09-10T12:00:00Z') },
  ];

  const orcamentos: Orcamento[] = [];
  const nos: No[] = [];
  const itens: Item[] = [];
  const componentes: Componente[] = [];
  const travas: ('SHARE' | 'UPDATE')[] = [];
  const auditoria: Record<string, unknown>[] = [];
  /// Quando definido, a trava devolve ESTE status em vez do gravado — simula
  /// uma leitura que ficou para trás de um fechamento concorrente.
  const concorrencia: { statusNaTrava?: 'DRAFT' | 'CLOSED' } = {};

  const ordenarPorPosicao = <T extends { position: number; createdAt?: Date }>(lista: T[]) =>
    [...lista].sort((a, b) => a.position - b.position || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  const detalhe = (o: Orcamento) => {
    const obra = obras.find((x) => x.id === o.constructionSiteId)!;
    return {
      ...o,
      constructionSite: { id: obra.id, code: obra.code, name: obra.name },
      createdBy: o.createdById ? { name: 'Engenheira Ana' } : null,
      closedBy: o.closedById ? { name: 'Engenheira Ana' } : null,
      nodes: nos.filter((n) => n.budgetId === o.id).map((n) => ({ ...n })),
      items: ordenarPorPosicao(itens.filter((i) => i.budgetId === o.id)).map((i) => ({
        ...i,
        components: ordenarPorPosicao(componentes.filter((c) => c.budgetItemId === i.id)).map((c) => ({ ...c })),
      })),
    };
  };

  const budget = {
    count: jest.fn(async ({ where }: { where: object }) => orcamentos.filter((o) => casa(o, where)).length),
    findFirst: jest.fn(async ({ where, include }: { where: object; include?: object }) => {
      const o = orcamentos.find((x) => casa(x, where));
      if (!o) return null;
      return include ? detalhe(o) : { ...o };
    }),
    findFirstOrThrow: jest.fn(async ({ where }: { where: object }) => {
      const o = orcamentos.find((x) => casa(x, where));
      if (!o) throw new Error('não encontrado');
      return { ...o };
    }),
    findMany: jest.fn(async ({ where }: { where: object }) =>
      orcamentos
        .filter((o) => casa(o, where))
        .map((o) => {
          const d = detalhe(o);
          return { ...o, constructionSite: d.constructionSite, items: d.items };
        }),
    ),
    create: jest.fn(async ({ data }: { data: Orcamento }) => {
      if (orcamentos.some((o) => o.companyId === data.companyId && o.code === data.code && o.version === data.version)) {
        throw violacaoDeUnique();
      }
      const novo: Orcamento = {
        description: null,
        closedAt: null,
        closedById: null,
        deletedAt: null,
        ...data,
        id: novoId(),
        createdAt: agora(),
        updatedAt: agora(),
      };
      orcamentos.push(novo);
      return { ...novo };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
      const alvo = orcamentos.find((o) => o.id === where.id)!;
      aplicar(alvo, data);
      return { ...alvo };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: object; data: object }) => {
      const alvos = orcamentos.filter((o) => casa(o, where));
      alvos.forEach((alvo) => aplicar(alvo, data));
      return { count: alvos.length };
    }),
  };

  const budgetNode = {
    findFirst: jest.fn(async ({ where }: { where: object }) => {
      const n = nos.find((x) => casa(x, where));
      return n ? { ...n } : null;
    }),
    findMany: jest.fn(async ({ where }: { where: object }) => nos.filter((n) => casa(n, where)).map((n) => ({ ...n }))),
    aggregate: jest.fn(async ({ where }: { where: object }) => {
      const posicoes = nos.filter((n) => casa(n, where)).map((n) => n.position);
      return { _max: { position: posicoes.length ? Math.max(...posicoes) : null } };
    }),
    create: jest.fn(async ({ data }: { data: No }) => {
      // A FK composta do banco: o pai precisa ser DO MESMO orçamento.
      if (data.parentId && !nos.some((n) => n.id === data.parentId && n.budgetId === data.budgetId)) {
        throw violacaoDeFk();
      }
      const novo: No = { ...data, id: novoId(), createdAt: agora(), updatedAt: agora() };
      nos.push(novo);
      return { ...novo };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
      const alvo = nos.find((n) => n.id === where.id)!;
      aplicar(alvo, data);
      return { ...alvo };
    }),
    deleteMany: jest.fn(async ({ where }: { where: object }) => {
      const alvos = nos.filter((n) => casa(n, where));
      alvos.forEach((alvo) => nos.splice(nos.indexOf(alvo), 1));
      return { count: alvos.length };
    }),
  };

  const removerItens = (alvos: Item[]) => {
    for (const alvo of alvos) {
      itens.splice(itens.indexOf(alvo), 1);
      for (const c of componentes.filter((x) => x.budgetItemId === alvo.id)) componentes.splice(componentes.indexOf(c), 1);
    }
  };

  const budgetItem = {
    findFirst: jest.fn(async ({ where }: { where: object }) => {
      const i = itens.find((x) => casa(x, where));
      return i ? { ...i } : null;
    }),
    findMany: jest.fn(async ({ where }: { where: object }) =>
      itens
        .filter((i) => casa(i, where))
        .map((i) => ({ ...i, _count: { components: componentes.filter((c) => c.budgetItemId === i.id).length } })),
    ),
    aggregate: jest.fn(async ({ where }: { where: object }) => {
      const posicoes = itens.filter((i) => casa(i, where)).map((i) => i.position);
      return { _max: { position: posicoes.length ? Math.max(...posicoes) : null } };
    }),
    create: jest.fn(async ({ data }: { data: Item & { components?: { create: Omit<Componente, 'id' | 'budgetItemId'>[] } } }) => {
      const { components, ...resto } = data;
      if (!nos.some((n) => n.id === resto.budgetNodeId && n.budgetId === resto.budgetId)) throw violacaoDeFk();
      const novo: Item = {
        compositionId: null,
        catalogItemId: null,
        referencePriceId: null,
        sourceCode: null,
        catalogItemType: null,
        ...resto,
        id: novoId(),
        createdAt: agora(),
        updatedAt: agora(),
      };
      itens.push(novo);
      for (const componente of components?.create ?? []) {
        componentes.push({ ...componente, id: novoId(), budgetItemId: novo.id });
      }
      return { ...novo };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
      const alvo = itens.find((i) => i.id === where.id)!;
      aplicar(alvo, data);
      return { ...alvo };
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const alvo = itens.find((i) => i.id === where.id)!;
      removerItens([alvo]);
      return alvo;
    }),
    deleteMany: jest.fn(async ({ where }: { where: object }) => {
      const alvos = itens.filter((i) => casa(i, where));
      removerItens(alvos);
      return { count: alvos.length };
    }),
  };

  const ordenarPrecos = (lista: Preco[]) =>
    [...lista].sort((a, b) => b.referenceDate.getTime() - a.referenceDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime());

  const prisma = {
    budget,
    budgetNode,
    budgetItem,
    constructionSite: {
      findFirst: jest.fn(async ({ where }: { where: object }) => obras.find((o) => casa(o, where)) ?? null),
      findMany: jest.fn(async ({ where }: { where: object }) => obras.filter((o) => casa(o, where))),
    },
    composition: {
      findFirst: jest.fn(async ({ where }: { where: object }) => {
        const c = composicoes.find((x) => casa(x, where));
        return c ? { ...c, items: [...c.items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: object }) => composicoes.filter((c) => casa(c, where))),
    },
    catalogItem: {
      findFirst: jest.fn(async ({ where }: { where: object }) => insumos.find((i) => casa(i, where)) ?? null),
      findMany: jest.fn(async ({ where }: { where: object }) =>
        insumos.filter((i) => casa(i, where)).map(({ id, code, name, unit, type }) => ({ id, code, name, unit, type })),
      ),
    },
    catalogItemPrice: {
      findFirst: jest.fn(async ({ where }: { where: object }) => ordenarPrecos(precos.filter((p) => casa(p, where)))[0] ?? null),
      findMany: jest.fn(async ({ where }: { where: object }) => ordenarPrecos(precos.filter((p) => casa(p, where)))),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      travas.push(strings.join('?').includes('FOR UPDATE') ? 'UPDATE' : 'SHARE');
      const [id, companyId] = valores;
      const o = orcamentos.find((x) => x.id === id && x.companyId === companyId && x.deletedAt === null);
      return o ? [{ id: o.id, code: o.code, status: concorrencia.statusNaTrava ?? o.status }] : [];
    }),
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const auditLogger = {
    log: jest.fn(async (entrada: Record<string, unknown>) => {
      auditoria.push(entrada);
    }),
  } as unknown as AuditLoggerService;

  return {
    service: new BudgetsService(prisma as unknown as PrismaService, auditLogger),
    prisma,
    orcamentos,
    nos,
    itens,
    componentes,
    composicoes,
    insumos,
    precos,
    travas,
    auditoria,
    concorrencia,
  };
}

type Servico = BudgetsService;
type Detalhe = Awaited<ReturnType<BudgetsService['findOne']>>;

const criar = (service: Servico, extra: Record<string, unknown> = {}) =>
  service.create(EMPRESA, USUARIO, {
    constructionSiteId: OBRA,
    name: 'Orçamento executivo',
    referenceDate: '2026-09-01',
    ...extra,
  } as never);

const noChamado = (detalhe: Detalhe, nome: string) => detalhe.nodes.find((n) => n.name === nome)!;

/// A EAP do enunciado.
async function montarEap(service: Servico, orcamentoId: string) {
  await service.addNode(EMPRESA, orcamentoId, { name: 'Serviços preliminares' });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Fundação' });
  let d = await service.addNode(EMPRESA, orcamentoId, { name: 'Estrutura' });
  const preliminares = noChamado(d, 'Serviços preliminares').id;
  const fundacao = noChamado(d, 'Fundação').id;
  const estrutura = noChamado(d, 'Estrutura').id;
  await service.addNode(EMPRESA, orcamentoId, { name: 'Canteiro', parentId: preliminares });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Locação', parentId: preliminares });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Escavação', parentId: fundacao });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Concreto', parentId: fundacao });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Pilares', parentId: estrutura });
  await service.addNode(EMPRESA, orcamentoId, { name: 'Vigas', parentId: estrutura });
  d = await service.addNode(EMPRESA, orcamentoId, { name: 'Lajes', parentId: estrutura });
  return d;
}

const manual = (budgetNodeId: string, description: string, unit: string, quantity: string | number, unitCost: string | number) => ({
  budgetNodeId,
  source: 'MANUAL' as const,
  description,
  unit,
  quantity,
  unitCost,
});

describe('Criar orçamento', () => {
  it('grava obra, nome, data-base, versão 1 e rascunho, com a empresa e o autor da SESSÃO', async () => {
    const { service, orcamentos, prisma } = makeService();

    const criado = await service.create(EMPRESA, USUARIO, {
      constructionSiteId: OBRA,
      name: '  Orçamento executivo ',
      referenceDate: '2026-09-01',
      companyId: OUTRA_EMPRESA,
    } as never);

    expect(orcamentos[0]).toMatchObject({
      companyId: EMPRESA,
      constructionSiteId: OBRA,
      code: 'ORC-0001',
      version: 1,
      status: 'DRAFT',
      name: 'Orçamento executivo',
      createdById: USUARIO,
    });
    expect(criado).toMatchObject({
      code: 'ORC-0001',
      version: 1,
      status: 'DRAFT',
      referenceDate: '2026-09-01',
      constructionSite: { id: OBRA, name: 'Residencial Aurora' },
      totalCost: '0.00',
      nodes: [],
      items: [],
    });
    // O sequencial conta só as versões 1 da empresa.
    expect(prisma.budget.count).toHaveBeenCalledWith({ where: { companyId: EMPRESA, version: 1 } });
  });

  it('a obra é obrigatória e precisa ser DA EMPRESA', async () => {
    const { service, orcamentos } = makeService();

    await expect(criar(service, { constructionSiteId: OBRA_DA_OUTRA })).rejects.toThrow(BadRequestException);
    await expect(criar(service, { constructionSiteId: OBRA_EXCLUIDA })).rejects.toThrow(/Obra não encontrada/);
    expect(orcamentos).toHaveLength(0);
  });

  it('código sequencial por empresa, e colisão recusada com mensagem', async () => {
    const { service, prisma } = makeService();
    await criar(service);
    const segundo = await criar(service);
    expect(segundo.code).toBe('ORC-0002');

    prisma.budget.count.mockResolvedValueOnce(0);
    await expect(criar(service)).rejects.toThrow(ConflictException);
  });

  it('data-base inválida é recusada', async () => {
    const { service } = makeService();

    await expect(criar(service, { referenceDate: '2026-02-30' })).rejects.toThrow(/Data-base inválida/);
  });
});

describe('Isolamento entre empresas', () => {
  it('orçamento de outra empresa dá "não encontrado" na leitura e nas escritas', async () => {
    const { service, nos } = makeService();
    const orcamento = await criar(service);

    await expect(service.findOne(OUTRA_EMPRESA, orcamento.id)).rejects.toThrow(NotFoundException);
    await expect(service.addNode(OUTRA_EMPRESA, orcamento.id, { name: 'Invasão' })).rejects.toThrow(NotFoundException);
    await expect(service.close(OUTRA_EMPRESA, orcamento.id, USUARIO)).rejects.toThrow(NotFoundException);
    expect(nos).toHaveLength(0);
  });

  it('a listagem filtra a empresa da sessão', async () => {
    const { service, prisma } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(prisma.budget.findMany.mock.calls[0]![0].where).toMatchObject({ companyId: EMPRESA, deletedAt: null });
  });

  it('composição e insumo de outra empresa não entram', async () => {
    const { service, itens } = makeService();
    const orcamento = await criar(service);
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Estrutura' });
    const no = d.nodes[0]!.id;

    await expect(
      service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'COMPOSITION', compositionId: COMPOSICAO_DA_OUTRA, quantity: 1 }),
    ).rejects.toThrow(/Composição não encontrada/);
    await expect(
      service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'CATALOG_ITEM', catalogItemId: INSUMO_DA_OUTRA, quantity: 1, unitCost: 1 }),
    ).rejects.toThrow(/Insumo não encontrado/);
    expect(itens).toHaveLength(0);
  });

  it('a estrutura de um orçamento não vaza para outro', async () => {
    const { service, nos, itens } = makeService();
    const a = await criar(service);
    const b = await criar(service);
    const deA = await service.addNode(EMPRESA, a.id, { name: 'Fundação' });
    const noDeA = deA.nodes[0]!.id;

    await expect(service.addNode(EMPRESA, b.id, { name: 'Vazado', parentId: noDeA })).rejects.toThrow(/Grupo pai não encontrado/);
    await expect(service.addItem(EMPRESA, b.id, manual(noDeA, 'Vazado', 'UN', 1, 1))).rejects.toThrow(/Grupo da EAP não encontrado/);
    await expect(service.removeNode(EMPRESA, b.id, noDeA)).rejects.toThrow(NotFoundException);
    expect(nos).toHaveLength(1);
    expect(itens).toHaveLength(0);
  });
});

describe('EAP', () => {
  it('cria grupos raiz, subgrupos e numera na ordem da EAP', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);

    const d = await montarEap(service, orcamento.id);

    expect(d.nodes.map((n) => `${n.code} ${n.name}`)).toEqual([
      '1 Serviços preliminares',
      '1.1 Canteiro',
      '1.2 Locação',
      '2 Fundação',
      '2.1 Escavação',
      '2.2 Concreto',
      '3 Estrutura',
      '3.1 Pilares',
      '3.2 Vigas',
      '3.3 Lajes',
    ]);
  });

  it('aceita vários níveis, sem limite artificial', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);

    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'Nível 1' });
    for (let nivel = 2; nivel <= 8; nivel++) {
      d = await service.addNode(EMPRESA, orcamento.id, { name: `Nível ${nivel}`, parentId: d.nodes.at(-1)!.id });
    }

    expect(d.nodes.at(-1)).toMatchObject({ code: '1.1.1.1.1.1.1.1', depth: 8, name: 'Nível 8' });
  });

  it('renomear muda só o nome', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    const d = await montarEap(service, orcamento.id);

    const renomeado = await service.updateNode(EMPRESA, orcamento.id, noChamado(d, 'Vigas').id, { name: 'Vigas e cintas' });

    expect(noChamado(renomeado, 'Vigas e cintas').code).toBe('3.2');
  });

  it('mover troca a posição entre irmãos e renumera', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    const d = await montarEap(service, orcamento.id);

    const movido = await service.moveNode(EMPRESA, orcamento.id, noChamado(d, 'Lajes').id, { direction: 'UP' });

    expect(noChamado(movido, 'Lajes').code).toBe('3.2');
    expect(noChamado(movido, 'Vigas').code).toBe('3.3');
  });

  it('remover um grupo leva os subgrupos e os itens deles, e registra na auditoria', async () => {
    const { service, auditoria } = makeService();
    const orcamento = await criar(service);
    let d = await montarEap(service, orcamento.id);
    await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Pilares').id, 'Pilar', 'UN', 3, 1000));
    await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Canteiro').id, 'Tapume', 'M2', 100, 45));

    d = await service.removeNode(EMPRESA, orcamento.id, noChamado(d, 'Estrutura').id);

    expect(d.nodes.map((n) => n.code)).toEqual(['1', '1.1', '1.2', '2', '2.1', '2.2']);
    expect(d.items.map((i) => i.description)).toEqual(['Tapume']);
    expect(auditoria[0]).toMatchObject({
      action: 'DELETE',
      entityType: 'BudgetNode',
      changes: { name: 'Estrutura', removedNodes: 4, removedItems: 1 },
    });
  });
});

describe('Itens e origens', () => {
  async function comNo() {
    const ctx = makeService();
    const orcamento = await criar(ctx.service);
    const d = await ctx.service.addNode(EMPRESA, orcamento.id, { name: 'Estrutura' });
    return { ...ctx, orcamento, no: d.nodes[0]!.id };
  }

  it('COMPOSIÇÃO: copia descrição, unidade, custo unitário e as linhas da composição', async () => {
    const { service, orcamento, no } = await comNo();

    const d = await service.addItem(EMPRESA, orcamento.id, {
      budgetNodeId: no,
      source: 'COMPOSITION',
      compositionId: ALVENARIA,
      quantity: '120.5',
    });

    expect(d.items[0]).toMatchObject({
      source: 'COMPOSITION',
      compositionId: ALVENARIA,
      catalogItemId: null,
      sourceCode: 'COMP-0001',
      description: 'Alvenaria de vedação',
      unit: 'M2',
      quantity: '120.5000',
      unitCost: '61.5000',
      totalCost: '7410.75',
    });
    expect(d.items[0]!.components.map((c) => [c.code, c.name, c.type, c.unit, c.coefficient, c.unitPrice, c.totalCost])).toEqual([
      ['MAT-0002', 'Bloco cerâmico', 'MATERIAL', 'UN', '25.000000', '1.5000', '37.5000'],
      ['MO-0001', 'Pedreiro', 'LABOR', 'H', '0.800000', '30.0000', '24.0000'],
    ]);
  });

  it('COMPOSIÇÃO: desativada, sem insumos ou com custo enviado de fora é recusada', async () => {
    const { service, orcamento, no, itens } = await comNo();
    const base = { budgetNodeId: no, source: 'COMPOSITION' as const, quantity: 1 };

    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, compositionId: COMPOSICAO_INATIVA })).rejects.toThrow(/desativada/);
    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, compositionId: COMPOSICAO_VAZIA })).rejects.toThrow(/não tem insumos/);
    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, compositionId: ALVENARIA, unitCost: 1 })).rejects.toThrow(/custo da composição/);
    expect(itens).toHaveLength(0);
  });

  it('INSUMO: copia descrição, unidade e natureza; o custo é o informado', async () => {
    const { service, orcamento, no } = await comNo();

    const d = await service.addItem(EMPRESA, orcamento.id, {
      budgetNodeId: no,
      source: 'CATALOG_ITEM',
      catalogItemId: TAPUME,
      quantity: 100,
      unitCost: 45,
    });

    expect(d.items[0]).toMatchObject({
      source: 'CATALOG_ITEM',
      catalogItemId: TAPUME,
      sourceCode: 'MAT-0001',
      catalogItemType: 'MATERIAL',
      description: 'Tapume provisório',
      unit: 'M2',
      unitCost: '45.0000',
      totalCost: '4500.00',
    });
  });

  it('INSUMO: sem custo, desativado, ou com descrição de fora é recusado', async () => {
    const { service, orcamento, no, itens } = await comNo();
    const base = { budgetNodeId: no, source: 'CATALOG_ITEM' as const, quantity: 1 };

    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, catalogItemId: TAPUME })).rejects.toThrow(/Informe o custo unitário/);
    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, catalogItemId: INSUMO_INATIVO, unitCost: 1 })).rejects.toThrow(/desativado/);
    await expect(service.addItem(EMPRESA, orcamento.id, { ...base, catalogItemId: TAPUME, unitCost: 1, description: 'Outro nome' })).rejects.toThrow(BadRequestException);
    expect(itens).toHaveLength(0);
  });

  it('MANUAL: descrição, unidade da lista, quantidade e custo informados', async () => {
    const { service, orcamento, no } = await comNo();

    const d = await service.addItem(EMPRESA, orcamento.id, manual(no, ' Taxa de ligação provisória ', 'VB', 1, '1250.75'));

    expect(d.items[0]).toMatchObject({
      source: 'MANUAL',
      compositionId: null,
      catalogItemId: null,
      description: 'Taxa de ligação provisória',
      unit: 'VB',
      totalCost: '1250.75',
    });
  });

  it('MANUAL: sem descrição, unidade fora da lista ou apontando para composição é recusado', async () => {
    const { service, orcamento, no, itens } = await comNo();

    await expect(service.addItem(EMPRESA, orcamento.id, manual(no, '  ', 'UN', 1, 1))).rejects.toThrow(/descrição/);
    await expect(service.addItem(EMPRESA, orcamento.id, manual(no, 'x', 'm²', 1, 1))).rejects.toThrow(/unidade válida/);
    await expect(
      service.addItem(EMPRESA, orcamento.id, { ...manual(no, 'x', 'UN', 1, 1), compositionId: ALVENARIA }),
    ).rejects.toThrow(BadRequestException);
    expect(itens).toHaveLength(0);
  });

  it('quantidade zero e custo negativo são recusados', async () => {
    const { service, orcamento, no, itens } = await comNo();

    await expect(service.addItem(EMPRESA, orcamento.id, manual(no, 'x', 'UN', 0, 1))).rejects.toThrow(/maior que zero/);
    await expect(service.addItem(EMPRESA, orcamento.id, manual(no, 'x', 'UN', 1, -1))).rejects.toThrow(/negativo/);
    expect(itens).toHaveLength(0);
  });

  it('o total da linha nunca vem do cliente', async () => {
    const { service, orcamento, no, prisma } = await comNo();

    const d = await service.addItem(EMPRESA, orcamento.id, { ...manual(no, 'Tapume', 'M2', 100, 45), totalCost: 1 } as never);

    expect(prisma.budgetItem.create.mock.calls[0]![0].data).not.toHaveProperty('totalCost');
    expect(d.items[0]!.totalCost).toBe('4500.00');
  });
});

describe('Data-base e preço de referência', () => {
  it('a sugestão de insumo é o preço vigente NA DATA-BASE, e o preço futuro é ignorado', async () => {
    // Referências de 40 (01/08), 45 (20/08) e 52 (10/09); data-base 01/09.
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-01' });

    const [tapume] = await service.catalogOptions(EMPRESA, orcamento.id, 'tap');

    expect(tapume!.referencePrice).toEqual({ unitPrice: '45.0000', unit: 'M2', referenceDate: '2026-08-20', source: 'MANUAL' });
  });

  it('orçamento com data-base posterior recebe o preço posterior', async () => {
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-15' });

    const [tapume] = await service.catalogOptions(EMPRESA, orcamento.id, 'tap');

    expect(tapume!.referencePrice!.unitPrice).toBe('52.0000');
  });

  it('antes de qualquer referência, não há sugestão — e o insumo entra com custo digitado', async () => {
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-07-01' });
    const [tapume] = await service.catalogOptions(EMPRESA, orcamento.id, 'tap');
    expect(tapume!.referencePrice).toBeNull();

    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Canteiro' });
    const comItem = await service.addItem(EMPRESA, orcamento.id, {
      budgetNodeId: d.nodes[0]!.id,
      source: 'CATALOG_ITEM',
      catalogItemId: TAPUME,
      quantity: 10,
      unitCost: 38,
    });
    expect(comItem.items[0]).toMatchObject({ unitCost: '38.0000', referencePriceId: null });
  });

  it('usar exatamente o preço vigente registra de qual referência veio; outro valor, não', async () => {
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-01' });
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Canteiro' });
    const no = d.nodes[0]!.id;

    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 1, unitCost: 45 });
    const depois = await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'CATALOG_ITEM', catalogItemId: BLOCO, quantity: 1, unitCost: 2 });

    expect(depois.items.map((i) => i.referencePriceId)).toEqual(['p-0820', null]);
  });

  it('a composição sugerida mostra o custo de hoje, que é o que será congelado', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);

    const opcoes = await service.compositionOptions(EMPRESA, orcamento.id, 'alv');

    expect(opcoes.find((o) => o.id === ALVENARIA)).toMatchObject({ unitCost: '61.5000', itemCount: 2, unit: 'M2' });
  });
});

describe('Snapshot', () => {
  it('preço de referência novo NÃO altera o item de insumo já orçado', async () => {
    const { service, precos } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-01' });
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Canteiro' });
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: d.nodes[0]!.id, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 100, unitCost: 45 });

    // Alguém registra depois um preço de 50 com data ANTERIOR à data-base.
    precos.push({ id: 'p-0825', companyId: EMPRESA, catalogItemId: TAPUME, unitPrice: D('50'), unit: 'M2', source: 'MANUAL', referenceDate: dia('2026-08-25'), createdAt: new Date() });
    const relido = await service.findOne(EMPRESA, orcamento.id);

    expect(relido.items[0]).toMatchObject({ unitCost: '45.0000', totalCost: '4500.00', referencePriceId: 'p-0820' });
  });

  it('renomear o insumo NÃO altera a descrição do item orçado', async () => {
    const { service, insumos } = makeService();
    const orcamento = await criar(service);
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Canteiro' });
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: d.nodes[0]!.id, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 1, unitCost: 45 });

    insumos.find((i) => i.id === TAPUME)!.name = 'Tapume metálico';
    const relido = await service.findOne(EMPRESA, orcamento.id);

    expect(relido.items[0]!.description).toBe('Tapume provisório');
  });

  it('alterar a composição depois NÃO altera o item nem as linhas copiadas', async () => {
    const { service, composicoes } = makeService();
    const orcamento = await criar(service);
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'Alvenaria' });
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: d.nodes[0]!.id, source: 'COMPOSITION', compositionId: ALVENARIA, quantity: 10 });

    const alvenaria = composicoes.find((c) => c.id === ALVENARIA)!;
    alvenaria.name = 'Alvenaria estrutural';
    alvenaria.items[1]!.unitPrice = D('35');
    alvenaria.items.push(linhaDeComposicao(TAPUME, 'MAT-0001', 'Tapume', 'MATERIAL', 'M2', '1', '45', 3));
    const relido = await service.findOne(EMPRESA, orcamento.id);

    expect(relido.items[0]).toMatchObject({ description: 'Alvenaria de vedação', unitCost: '61.5000', totalCost: '615.00' });
    expect(relido.items[0]!.components.map((c) => c.unitPrice)).toEqual(['1.5000', '30.0000']);
  });

  it('ler o orçamento não consulta composição, insumo nem preço', async () => {
    const { service, prisma } = makeService();
    const orcamento = await criar(service);
    prisma.composition.findFirst.mockClear();
    prisma.catalogItem.findFirst.mockClear();
    prisma.catalogItemPrice.findFirst.mockClear();
    prisma.catalogItemPrice.findMany.mockClear();

    await service.findOne(EMPRESA, orcamento.id);
    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(prisma.composition.findFirst).not.toHaveBeenCalled();
    expect(prisma.catalogItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.catalogItemPrice.findFirst).not.toHaveBeenCalled();
    expect(prisma.catalogItemPrice.findMany).not.toHaveBeenCalled();
  });
});

describe('Totais', () => {
  it('total por grupo inclui os descendentes; total geral soma tudo', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    let d = await montarEap(service, orcamento.id);
    await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Canteiro').id, 'Tapume', 'M2', 100, 45)); // 4.500,00
    await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Locação').id, 'Gabarito', 'VB', 1, '850.5')); // 850,50
    await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Serviços preliminares').id, 'Mobilização', 'VB', 1, 1000)); // 1.000,00
    d = await service.addItem(EMPRESA, orcamento.id, manual(noChamado(d, 'Pilares').id, 'Pilar', 'UN', 3, 1000)); // 3.000,00

    expect(noChamado(d, 'Canteiro')).toMatchObject({ subtotal: '4500.00', itemCount: 1 });
    expect(noChamado(d, 'Serviços preliminares')).toMatchObject({ subtotal: '6350.50', itemCount: 3 });
    expect(noChamado(d, 'Estrutura')).toMatchObject({ subtotal: '3000.00' });
    expect(noChamado(d, 'Fundação')).toMatchObject({ subtotal: '0.00', itemCount: 0 });
    expect(d.totalCost).toBe('9350.50');
    expect(d.itemCount).toBe(4);
  });

  it('arredonda para centavos UMA vez, sobre a soma exata', async () => {
    // Três linhas de 1 × R$ 0,3333: cada linha mostra R$ 0,33, mas o subtotal e
    // o total são R$ 1,00 — a soma exata 0,9999 arredondada.
    const { service } = makeService();
    const orcamento = await criar(service);
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'Diversos' });
    const no = d.nodes[0]!.id;
    for (const nome of ['a', 'b', 'c']) d = await service.addItem(EMPRESA, orcamento.id, manual(no, nome, 'UN', 1, '0.3333'));

    expect(d.items.map((i) => i.totalCost)).toEqual(['0.33', '0.33', '0.33']);
    expect(d.nodes[0]).toMatchObject({ subtotal: '1.00', subtotalExact: '0.99990000' });
    expect(d).toMatchObject({ totalCost: '1.00', totalCostExact: '0.99990000' });
  });

  it('Decimal sem erro de ponto flutuante', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    d = await service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'x', 'UN', '0.1', 3));

    expect(d.items[0]!.totalCostExact).toBe('0.30000000');
  });

  it('a listagem mostra o total geral', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    await service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'Tapume', 'M2', 100, 45));

    const pagina = await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(pagina.data[0]).toMatchObject({ code: 'ORC-0001', version: 1, status: 'DRAFT', totalCost: '4500.00', referenceDate: '2026-09-01' });
  });
});

describe('Rascunho editável', () => {
  it('quantidade editável em qualquer origem; custo de insumo e manual editáveis', async () => {
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-01' });
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    const no = d.nodes[0]!.id;
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'COMPOSITION', compositionId: ALVENARIA, quantity: 1 });
    d = await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 1, unitCost: 40 });
    const [composicao, insumo] = d.items;

    await service.updateItem(EMPRESA, orcamento.id, composicao!.id, { quantity: 2 });
    d = await service.updateItem(EMPRESA, orcamento.id, insumo!.id, { unitCost: 45 });

    expect(d.items[0]).toMatchObject({ quantity: '2.0000', totalCost: '123.00' });
    // Ao passar a usar exatamente o vigente na data-base, a referência é registrada.
    expect(d.items[1]).toMatchObject({ unitCost: '45.0000', referencePriceId: 'p-0820' });
  });

  it('custo de item de composição não se edita; descrição de insumo também não', async () => {
    const { service, itens } = makeService();
    const orcamento = await criar(service);
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    const no = d.nodes[0]!.id;
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'COMPOSITION', compositionId: ALVENARIA, quantity: 1 });
    d = await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: no, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 1, unitCost: 40 });

    await expect(service.updateItem(EMPRESA, orcamento.id, d.items[0]!.id, { unitCost: 1 })).rejects.toThrow(/congelado/);
    await expect(service.updateItem(EMPRESA, orcamento.id, d.items[1]!.id, { description: 'Outro' })).rejects.toThrow(/não se editam/);
    expect(itens[0]!.unitCost.toString()).toBe('61.5');
  });

  it('item manual edita descrição e unidade', async () => {
    const { service } = makeService();
    const orcamento = await criar(service);
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    d = await service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'Taxa', 'VB', 1, 100));

    d = await service.updateItem(EMPRESA, orcamento.id, d.items[0]!.id, { description: 'Taxa de ligação', unit: 'UN' });

    expect(d.items[0]).toMatchObject({ description: 'Taxa de ligação', unit: 'UN' });
  });

  it('remover item registra na auditoria o que ele era', async () => {
    const { service, auditoria, itens } = makeService();
    const orcamento = await criar(service);
    let d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    d = await service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'Tapume', 'M2', 100, 45));

    await service.removeItem(EMPRESA, orcamento.id, d.items[0]!.id);

    expect(itens).toHaveLength(0);
    expect(auditoria[0]).toMatchObject({
      action: 'DELETE',
      entityType: 'BudgetItem',
      changes: { description: 'Tapume', quantity: '100.0000', unitCost: '45.0000' },
    });
  });

  it('escritas de EAP e item travam o orçamento em modo compartilhado; cabeçalho, em exclusivo', async () => {
    const { service, travas } = makeService();
    const orcamento = await criar(service);

    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    await service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'x', 'UN', 1, 1));
    await service.update(EMPRESA, orcamento.id, { name: 'Novo nome' });

    expect(travas).toEqual(['SHARE', 'SHARE', 'UPDATE']);
  });

  it('mudar a data-base de um rascunho não reprecifica itens já incluídos', async () => {
    const { service } = makeService();
    const orcamento = await criar(service, { referenceDate: '2026-09-01' });
    const d = await service.addNode(EMPRESA, orcamento.id, { name: 'X' });
    await service.addItem(EMPRESA, orcamento.id, { budgetNodeId: d.nodes[0]!.id, source: 'CATALOG_ITEM', catalogItemId: TAPUME, quantity: 1, unitCost: 45 });

    const relido = await service.update(EMPRESA, orcamento.id, { referenceDate: '2026-09-15' });

    expect(relido).toMatchObject({ referenceDate: '2026-09-15' });
    expect(relido.items[0]!.unitCost).toBe('45.0000');
  });
});

describe('Fechamento', () => {
  async function comItem() {
    const ctx = makeService();
    const orcamento = await criar(ctx.service);
    const d = await ctx.service.addNode(EMPRESA, orcamento.id, { name: 'Canteiro' });
    const comItens = await ctx.service.addItem(EMPRESA, orcamento.id, manual(d.nodes[0]!.id, 'Tapume', 'M2', 100, 45));
    return { ...ctx, orcamento, no: d.nodes[0]!.id, item: comItens.items[0]!.id };
  }

  it('fecha: status CLOSED, quem e quando, e registra na auditoria', async () => {
    const { service, orcamento, auditoria, orcamentos } = await comItem();

    const fechado = await service.close(EMPRESA, orcamento.id, USUARIO);

    expect(fechado).toMatchObject({ status: 'CLOSED', closedBy: { name: 'Engenheira Ana' }, totalCost: '4500.00' });
    expect(orcamentos[0]).toMatchObject({ status: 'CLOSED', closedById: USUARIO });
    expect(orcamentos[0]!.closedAt).toBeInstanceOf(Date);
    expect(auditoria.at(-1)).toMatchObject({
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: orcamento.id,
      userId: USUARIO,
      changes: { status: { from: 'DRAFT', to: 'CLOSED' } },
    });
  });

  it('orçamento sem item não fecha, e continua rascunho', async () => {
    const { service, orcamentos } = makeService();
    const orcamento = await criar(service);
    await service.addNode(EMPRESA, orcamento.id, { name: 'Vazio' });

    await expect(service.close(EMPRESA, orcamento.id, USUARIO)).rejects.toThrow(/não tem nenhum item/);
    expect(orcamentos[0]!.status).toBe('DRAFT');
  });

  it('o fechamento é transacional: trava exclusiva, confere e muda o status só se ainda for rascunho', async () => {
    const { service, orcamento, travas, prisma } = await comItem();
    travas.length = 0;

    await service.close(EMPRESA, orcamento.id, USUARIO);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(travas).toEqual(['UPDATE']);
    expect(prisma.budget.updateMany.mock.calls[0]![0].where).toMatchObject({ id: orcamento.id, companyId: EMPRESA, status: 'DRAFT' });
  });

  it('se outro fechamento ganhou a corrida, este não grava nada e é recusado', async () => {
    const { service, orcamento, orcamentos, concorrencia, auditoria } = await comItem();
    // A trava leu DRAFT, mas o registro já está fechado.
    orcamentos[0]!.status = 'CLOSED';
    orcamentos[0]!.closedAt = new Date('2026-09-14T09:00:00Z');
    concorrencia.statusNaTrava = 'DRAFT';
    const antes = auditoria.length;

    await expect(service.close(EMPRESA, orcamento.id, USUARIO)).rejects.toThrow(ConflictException);
    expect(orcamentos[0]!.closedAt).toEqual(new Date('2026-09-14T09:00:00Z'));
    expect(auditoria).toHaveLength(antes);
  });

  it('fechar de novo é recusado', async () => {
    const { service, orcamento } = await comItem();
    await service.close(EMPRESA, orcamento.id, USUARIO);

    await expect(service.close(EMPRESA, orcamento.id, USUARIO)).rejects.toThrow(ConflictException);
  });

  it('FECHADO continua editável: cabeçalho, EAP e itens mudam, e o status continua fechado', async () => {
    const { service, orcamento, no, item, nos, itens, orcamentos } = await comItem();
    await service.close(EMPRESA, orcamento.id, USUARIO);

    await service.update(EMPRESA, orcamento.id, { name: 'Outro' });
    await service.addNode(EMPRESA, orcamento.id, { name: 'Novo grupo' });
    await service.updateNode(EMPRESA, orcamento.id, no, { name: 'Renomeado' });
    await service.addItem(EMPRESA, orcamento.id, manual(no, 'Extra', 'UN', 1, 1));
    await service.updateItem(EMPRESA, orcamento.id, item, { quantity: 120 });

    expect(orcamentos[0]).toMatchObject({ name: 'Outro', status: 'CLOSED' });
    expect(nos.map((n) => n.name)).toEqual(['Renomeado', 'Novo grupo']);
    expect(itens.map((i) => i.quantity.toString())).toEqual(['120', '1']);
  });

  it('FECHADO não é excluído e não fica sem itens', async () => {
    const { service, orcamento, no, item, orcamentos, itens } = await comItem();
    await service.close(EMPRESA, orcamento.id, USUARIO);

    await expect(service.remove(EMPRESA, orcamento.id)).rejects.toThrow(/Só rascunho pode ser excluído/);
    await expect(service.removeItem(EMPRESA, orcamento.id, item)).rejects.toThrow(/não pode ficar sem itens/);
    await expect(service.removeNode(EMPRESA, orcamento.id, no)).rejects.toThrow(/não pode ficar sem itens/);
    expect(orcamentos[0]!.deletedAt).toBeNull();
    expect(itens).toHaveLength(1);
  });

  it('FECHADO continua legível, com os mesmos totais', async () => {
    const { service, orcamento } = await comItem();
    await service.close(EMPRESA, orcamento.id, USUARIO);

    const lido = await service.findOne(EMPRESA, orcamento.id);

    expect(lido).toMatchObject({ status: 'CLOSED', totalCost: '4500.00' });
    expect(lido.items).toHaveLength(1);
  });

  it('rascunho pode ser excluído (logicamente); a exclusão embaralha o código', async () => {
    const { service, orcamentos } = makeService();
    const orcamento = await criar(service);

    await service.remove(EMPRESA, orcamento.id);

    expect(orcamentos[0]!.deletedAt).toBeInstanceOf(Date);
    expect(orcamentos[0]!.code).toContain('__deleted__');
  });
});
