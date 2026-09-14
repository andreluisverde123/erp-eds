import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { CatalogItemPricesService } from '../catalog-item-prices/catalog-item-prices.service';
import { CatalogItemsService } from '../catalog-items/catalog-items.service';
import { UpdateCatalogItemDto } from '../catalog-items/dto/update-catalog-item.dto';
import { CompositionsService } from './compositions.service';
import { CreateCompositionItemDto, UpdateCompositionItemDto } from './dto/composition-item.dto';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';

const ALVENARIA = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTRAPISO = 'aaaaaaaa-0000-4000-8000-000000000002';
const COMPOSICAO_DA_OUTRA = 'aaaaaaaa-0000-4000-8000-000000000003';

const BLOCO = 'bbbbbbbb-0000-4000-8000-000000000001';
const PEDREIRO = 'bbbbbbbb-0000-4000-8000-000000000002';
const SERVENTE = 'bbbbbbbb-0000-4000-8000-000000000003';
const BETONEIRA = 'bbbbbbbb-0000-4000-8000-000000000004';
const ARGAMASSA = 'bbbbbbbb-0000-4000-8000-000000000005';
const INATIVO = 'bbbbbbbb-0000-4000-8000-000000000006';
const EXCLUIDO = 'bbbbbbbb-0000-4000-8000-000000000007';
const DA_OUTRA = 'bbbbbbbb-0000-4000-8000-000000000008';

type Natureza = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

interface Insumo {
  id: string;
  companyId: string;
  code: string;
  name: string;
  searchKey: string;
  unit: string;
  type: Natureza;
  active: boolean;
  deletedAt: Date | null;
}

interface Composicao {
  id: string;
  companyId: string;
  code: string;
  name: string;
  searchKey: string;
  description: string | null;
  unit: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface Item {
  id: string;
  compositionId: string;
  catalogItemId: string;
  coefficient: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}

function insumo(
  id: string,
  code: string,
  name: string,
  unit: string,
  type: Natureza,
  extra: Partial<Insumo> = {},
): Insumo {
  return {
    id,
    companyId: EMPRESA,
    code,
    name,
    searchKey: name.toLowerCase(),
    unit,
    type,
    active: true,
    deletedAt: null,
    ...extra,
  };
}

function catalogo(): Insumo[] {
  return [
    insumo(BLOCO, 'MAT-0001', 'Bloco cerâmico', 'UN', 'MATERIAL'),
    insumo(PEDREIRO, 'MO-0001', 'Pedreiro', 'H', 'LABOR'),
    insumo(SERVENTE, 'MO-0002', 'Servente', 'H', 'LABOR'),
    insumo(BETONEIRA, 'EQP-0001', 'Betoneira', 'H', 'EQUIPMENT'),
    insumo(ARGAMASSA, 'MAT-0002', 'Argamassa', 'KG', 'MATERIAL'),
    insumo(INATIVO, 'MAT-0003', 'Cal hidratada', 'SC', 'MATERIAL', { active: false }),
    insumo(EXCLUIDO, 'MAT-0004', 'Areia', 'M3', 'MATERIAL', { deletedAt: new Date() }),
    // Mesmo código e nome do bloco, de OUTRA empresa.
    insumo(DA_OUTRA, 'MAT-0001', 'Bloco cerâmico', 'UN', 'MATERIAL', {
      companyId: OUTRA_EMPRESA,
    }),
  ];
}

function composicao(extra: Partial<Composicao> = {}): Composicao {
  const criada = new Date('2026-09-14T10:00:00.000Z');
  return {
    id: ALVENARIA,
    companyId: EMPRESA,
    code: 'COMP-0001',
    name: 'Alvenaria de vedação',
    searchKey: 'alvenaria de vedacao',
    description: null,
    unit: 'M2',
    active: true,
    createdAt: criada,
    updatedAt: criada,
    deletedAt: null,
    ...extra,
  };
}

const violacaoDeUnique = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7' });

/// Dublê COM ESTADO: composições, itens e catálogo vivem em arrays, e as
/// uniques do banco — `(empresa, código)` e `(composição, insumo)` — são
/// reproduzidas. É o que deixa os testes provarem o comportamento, e não só a
/// forma das chamadas.
function makeService(
  estado: { insumos?: Insumo[]; composicoes?: Composicao[]; itens?: Item[] } = {},
) {
  const insumos = estado.insumos ?? catalogo();
  const composicoes = estado.composicoes ?? [composicao()];
  const itens = estado.itens ?? [];
  const auditoria: Record<string, unknown>[] = [];
  let sequencia = 0;

  const novoId = () => `99999999-0000-4000-8000-${String(++sequencia).padStart(12, '0')}`;
  const aplicar = (alvo: object, data: Record<string, unknown>) =>
    Object.entries(data).forEach(([campo, valor]) => {
      if (valor !== undefined) Object.assign(alvo, { [campo]: valor });
    });
  const itensDe = (compositionId: string) =>
    itens
      .filter((item) => item.compositionId === compositionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const insumoDaLinha = (id: string) => {
    const { code, name, unit, type, active } = insumos.find((i) => i.id === id)!;
    return { id, code, name, unit, type, active };
  };

  const composition = {
    count: jest.fn(
      async ({ where }: { where: { companyId: string } }) =>
        composicoes.filter((c) => c.companyId === where.companyId).length,
    ),
    findMany: jest.fn(async ({ where }: { where: { companyId: string } }) =>
      composicoes
        .filter((c) => c.companyId === where.companyId && c.deletedAt === null)
        .map((c) => ({
          ...c,
          items: itensDe(c.id).map(({ coefficient, unitPrice }) => ({ coefficient, unitPrice })),
        })),
    ),
    findFirst: jest.fn(
      async ({ where, include }: { where: { id: string; companyId: string }; include?: object }) => {
        const achada = composicoes.find(
          (c) => c.id === where.id && c.companyId === where.companyId && c.deletedAt === null,
        );
        if (!achada) return null;
        if (!include) return { ...achada };
        return {
          ...achada,
          items: itensDe(achada.id).map((item) => ({
            ...item,
            catalogItem: insumoDaLinha(item.catalogItemId),
          })),
        };
      },
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (composicoes.some((c) => c.companyId === data.companyId && c.code === data.code)) {
        throw violacaoDeUnique();
      }
      const agora = new Date();
      const nova = {
        id: novoId(),
        description: null,
        createdAt: agora,
        updatedAt: agora,
        deletedAt: null,
        ...data,
        active: data.active ?? true,
      } as Composicao;
      composicoes.push(nova);
      return { ...nova };
    }),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const alvo = composicoes.find((c) => c.id === where.id)!;
        aplicar(alvo, data);
        return { ...alvo };
      },
    ),
  };

  const catalogItem = {
    findFirst: jest.fn(async ({ where }: { where: { id: string; companyId: string } }) => {
      const achado = insumos.find(
        (i) => i.id === where.id && i.companyId === where.companyId && i.deletedAt === null,
      );
      return achado ? { ...achado } : null;
    }),
    findMany: jest.fn(async () => []),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const alvo = insumos.find((i) => i.id === where.id)!;
        aplicar(alvo, data);
        return { ...alvo };
      },
    ),
  };

  const compositionItem = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (
        itens.some(
          (i) => i.compositionId === data.compositionId && i.catalogItemId === data.catalogItemId,
        )
      ) {
        throw violacaoDeUnique();
      }
      const id = novoId();
      const agora = new Date(Date.UTC(2026, 8, 14, 12, 0, 0, sequencia));
      const novo = { id, createdAt: agora, updatedAt: agora, ...data } as Item;
      itens.push(novo);
      return { ...novo };
    }),
    findFirst: jest.fn(async ({ where }: { where: { id: string; compositionId: string } }) => {
      const achado = itens.find((i) => i.id === where.id && i.compositionId === where.compositionId);
      return achado ? { ...achado } : null;
    }),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const alvo = itens.find((i) => i.id === where.id)!;
        aplicar(alvo, data);
        return { ...alvo };
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const [removido] = itens.splice(
        itens.findIndex((i) => i.id === where.id),
        1,
      );
      return removido;
    }),
    count: jest.fn(
      async ({
        where,
      }: {
        where: { catalogItemId: string; composition?: { deletedAt: null } };
      }) =>
        itens.filter(
          (i) =>
            i.catalogItemId === where.catalogItemId &&
            (!where.composition ||
              composicoes.find((c) => c.id === i.compositionId)?.deletedAt === null),
        ).length,
    ),
  };

  /// Histórico de preços de referência, também com estado: filtra por empresa,
  /// insumo e data, e ordena do mais recente para o mais antigo.
  const precos: PrecoDeReferencia[] = [];
  const catalogItemPrice = {
    findMany: jest.fn(
      async ({
        where,
      }: {
        where: { companyId: string; catalogItemId: { in: string[] }; referenceDate: { lte: Date } };
      }) =>
        precos
          .filter(
            (p) =>
              p.companyId === where.companyId &&
              where.catalogItemId.in.includes(p.catalogItemId) &&
              p.referenceDate <= where.referenceDate.lte,
          )
          .sort(
            (a, b) =>
              b.referenceDate.getTime() - a.referenceDate.getTime() ||
              b.createdAt.getTime() - a.createdAt.getTime(),
          ),
    ),
    create: jest.fn(async ({ data }: { data: Omit<PrecoDeReferencia, 'id' | 'createdAt'> }) => {
      const novo = { id: novoId(), createdAt: new Date(), ...data } as PrecoDeReferencia;
      precos.push(novo);
      return { ...novo, createdBy: null, purchaseOrder: null };
    }),
    count: jest.fn(
      async ({ where }: { where: { catalogItemId: string } }) =>
        precos.filter((p) => p.catalogItemId === where.catalogItemId).length,
    ),
  };

  const prisma = {
    composition,
    catalogItem,
    compositionItem,
    catalogItemPrice,
    purchaseRequestItem: { count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const auditLogger = {
    log: jest.fn(async (entrada: Record<string, unknown>) => {
      auditoria.push(entrada);
    }),
  } as unknown as AuditLoggerService;

  return {
    service: new CompositionsService(prisma, auditLogger),
    /// O serviço de Insumos DE VERDADE, sobre o mesmo estado.
    insumosService: new CatalogItemsService(prisma),
    /// O serviço de preços de referência DE VERDADE, sobre o mesmo estado.
    precosService: new CatalogItemPricesService(prisma),
    composition,
    catalogItem,
    compositionItem,
    catalogItemPrice,
    composicoes,
    itens,
    insumos,
    precos,
    auditoria,
  };
}

interface PrecoDeReferencia {
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

function precoDeReferencia(extra: Partial<PrecoDeReferencia>): PrecoDeReferencia {
  return {
    id: `ffffffff-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`,
    companyId: EMPRESA,
    catalogItemId: BLOCO,
    unitPrice: new Prisma.Decimal('1.5000'),
    unit: 'UN',
    source: 'MANUAL',
    referenceDate: new Date('2026-09-01T00:00:00.000Z'),
    note: null,
    purchaseOrderId: null,
    purchaseOrderItemId: null,
    createdById: null,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    ...extra,
  };
}

const OPCOES_DO_CATALOGO = [
  { id: BLOCO, code: 'MAT-0001', name: 'Bloco cerâmico', unit: 'UN', type: 'MATERIAL' },
  { id: PEDREIRO, code: 'MO-0001', name: 'Pedreiro', unit: 'H', type: 'LABOR' },
  { id: BETONEIRA, code: 'EQP-0001', name: 'Betoneira', unit: 'H', type: 'EQUIPMENT' },
];

describe('Preço de referência na composição (ORC-03)', () => {
  it('a busca de insumo SUGERE o preço vigente hoje de cada insumo', async () => {
    const { service, catalogItem, precos } = makeService();
    catalogItem.findMany.mockResolvedValueOnce(OPCOES_DO_CATALOGO as never);
    precos.push(
      precoDeReferencia({ unitPrice: new Prisma.Decimal('1.40'), referenceDate: new Date('2026-08-01T00:00:00.000Z') }),
      precoDeReferencia({ unitPrice: new Prisma.Decimal('1.50'), referenceDate: new Date('2026-09-01T00:00:00.000Z') }),
      precoDeReferencia({ catalogItemId: PEDREIRO, unit: 'H', unitPrice: new Prisma.Decimal('30'), source: 'PURCHASE' }),
    );

    const opcoes = await service.catalogOptions(EMPRESA, 'b');

    expect(opcoes.map((o) => [o.name, o.referencePrice])).toEqual([
      ['Bloco cerâmico', { unitPrice: '1.5000', unit: 'UN', referenceDate: '2026-09-01', source: 'MANUAL' }],
      ['Pedreiro', { unitPrice: '30.0000', unit: 'H', referenceDate: '2026-09-01', source: 'PURCHASE' }],
      // Sem histórico: sem sugestão, e a composição continua podendo ser feita.
      ['Betoneira', null],
    ]);
  });

  it('preço com data FUTURA não é sugerido', async () => {
    const { service, catalogItem, precos } = makeService();
    catalogItem.findMany.mockResolvedValueOnce(OPCOES_DO_CATALOGO.slice(0, 1) as never);
    precos.push(precoDeReferencia({ referenceDate: new Date('2999-01-01T00:00:00.000Z') }));

    const [bloco] = await service.catalogOptions(EMPRESA, 'b');

    expect(bloco!.referencePrice).toBeNull();
  });

  it('preço de OUTRA empresa não é sugerido', async () => {
    const { service, catalogItem, precos, catalogItemPrice } = makeService();
    catalogItem.findMany.mockResolvedValueOnce(OPCOES_DO_CATALOGO.slice(0, 1) as never);
    precos.push(precoDeReferencia({ companyId: OUTRA_EMPRESA }));

    const [bloco] = await service.catalogOptions(EMPRESA, 'b');

    expect(bloco!.referencePrice).toBeNull();
    expect(catalogItemPrice.findMany.mock.calls[0]![0].where.companyId).toBe(EMPRESA);
  });

  it('preço registrado em outra unidade não é sugerido — não há conversão', async () => {
    const { service, catalogItem, precos } = makeService();
    catalogItem.findMany.mockResolvedValueOnce(OPCOES_DO_CATALOGO.slice(0, 1) as never);
    precos.push(precoDeReferencia({ unit: 'MI' }));

    const [bloco] = await service.catalogOptions(EMPRESA, 'b');

    expect(bloco!.referencePrice).toBeNull();
  });

  it('o preço da linha é SNAPSHOT: um preço novo no histórico não muda a composição', async () => {
    // Hoje o bloco custa R$ 1,50 e a composição guarda R$ 1,50. Amanhã a
    // referência sobe para R$ 1,80 — a composição continua em R$ 1,50.
    const { service, precosService, compositionItem, itens } = makeService();
    await precosService.registerManual(EMPRESA, 'usuario', BLOCO, {
      unitPrice: '1.50',
      referenceDate: '2026-09-01',
    });
    await incluir(service, BLOCO, 25, 1.5);

    await precosService.registerManual(EMPRESA, 'usuario', BLOCO, {
      unitPrice: '1.80',
      referenceDate: '2026-09-10',
    });
    const detalhe = await service.findOne(EMPRESA, ALVENARIA);

    expect(detalhe.items[0]).toMatchObject({ unitPrice: '1.5000', totalCost: '37.5000' });
    expect(detalhe.unitCost).toBe('37.5000');
    expect(itens[0]!.unitPrice.toString()).toBe('1.5');
    expect(compositionItem.update).not.toHaveBeenCalled();
  });

  it('ler, listar e incluir item na composição nunca consultam o histórico', async () => {
    const { service, catalogItemPrice } = makeService();

    await montarAlvenaria(service);
    await service.findAll(EMPRESA, { page: 1, limit: 10 });
    await service.findOne(EMPRESA, ALVENARIA);

    expect(catalogItemPrice.findMany).not.toHaveBeenCalled();
  });

  it('o preço enviado é o que a linha guarda, mesmo diferente da sugestão', async () => {
    const { service, precos } = makeService();
    precos.push(precoDeReferencia({ unitPrice: new Prisma.Decimal('1.50') }));

    const detalhe = await incluir(service, BLOCO, 25, 1.42);

    expect(detalhe.items[0]!.unitPrice).toBe('1.4200');
  });

  it('composição sem nenhum preço histórico continua funcionando', async () => {
    const { service, precos } = makeService();

    const detalhe = await montarAlvenaria(service);

    expect(precos).toHaveLength(0);
    expect(detalhe.unitCost).toBe('75.0000');
  });

  it('insumo com preço de referência não troca de unidade', async () => {
    const { insumosService, precosService, insumos } = makeService();
    await precosService.registerManual(EMPRESA, 'usuario', ARGAMASSA, {
      unitPrice: '0.35',
      referenceDate: '2026-09-01',
    });

    await expect(insumosService.update(EMPRESA, ARGAMASSA, { unit: 'SC' })).rejects.toThrow(
      /preços de referência/,
    );
    expect(insumos.find((i) => i.id === ARGAMASSA)!.unit).toBe('KG');
  });
});

type Servico = CompositionsService;

function incluir(
  service: Servico,
  catalogItemId: string,
  coefficient: number | string,
  unitPrice: number | string,
  compositionId = ALVENARIA,
) {
  return service.addItem(EMPRESA, compositionId, {
    catalogItemId,
    coefficient: coefficient as number,
    unitPrice: unitPrice as number,
  });
}

/// O exemplo do enunciado.
async function montarAlvenaria(service: Servico) {
  await incluir(service, BLOCO, 25, 1.5);
  await incluir(service, PEDREIRO, 0.8, 30);
  await incluir(service, SERVENTE, 0.6, 20);
  return incluir(service, BETONEIRA, 0.1, 15);
}

describe('Cadastrar composição', () => {
  it('grava nome, unidade e a empresa da SESSÃO', async () => {
    const { service, composicoes } = makeService({ composicoes: [] });

    const criada = await service.create(EMPRESA, {
      name: '  Alvenaria de vedação ',
      unit: 'M2',
      companyId: OUTRA_EMPRESA,
    } as never);

    // O `companyId` do corpo é ignorado: quem manda é a sessão.
    expect(composicoes[0]).toMatchObject({
      companyId: EMPRESA,
      name: 'Alvenaria de vedação',
      searchKey: 'alvenaria de vedacao',
      unit: 'M2',
      active: true,
    });
    expect(criada).toMatchObject({ code: 'COMP-0001', unitCost: '0.0000', items: [] });
  });

  it('o código é sequencial por empresa, gerado no servidor', async () => {
    const existentes = [1, 2, 3].map((n) =>
      composicao({ id: `aaaaaaaa-0000-4000-8000-00000000010${n}`, code: `COMP-000${n}` }),
    );
    const { service, composition, composicoes } = makeService({ composicoes: existentes });

    await service.create(EMPRESA, { name: 'Contrapiso', unit: 'M2' });

    expect(composicoes[3]!.code).toBe('COMP-0004');
    expect(composition.count).toHaveBeenCalledWith({ where: { companyId: EMPRESA } });
  });

  it('o MESMO código é permitido em empresas diferentes', async () => {
    const { service, composicoes } = makeService({
      composicoes: [composicao({ id: COMPOSICAO_DA_OUTRA, companyId: OUTRA_EMPRESA })],
    });

    await service.create(EMPRESA, { name: 'Alvenaria de vedação', unit: 'M2' });

    expect(composicoes.map((c) => [c.companyId, c.code])).toEqual([
      [OUTRA_EMPRESA, 'COMP-0001'],
      [EMPRESA, 'COMP-0001'],
    ]);
  });

  it('código repetido na mesma empresa é recusado com mensagem, não com erro cru', async () => {
    // A janela de corrida do `count()`: duas criações simultâneas calculam o
    // mesmo número, e a unique `(empresa, código)` recusa a segunda.
    const { service, composition, composicoes } = makeService();
    composition.count.mockResolvedValueOnce(0);

    await expect(service.create(EMPRESA, { name: 'Outra', unit: 'M2' })).rejects.toThrow(
      ConflictException,
    );
    expect(composicoes).toHaveLength(1);
  });

  it('não grava custo nenhum', async () => {
    const { service, composition } = makeService({ composicoes: [] });

    await service.create(EMPRESA, { name: 'Contrapiso', unit: 'M2' });

    const data = composition.create.mock.calls[0]![0].data;
    for (const campo of ['unitCost', 'totalCost', 'cost', 'price']) {
      expect(data).not.toHaveProperty(campo);
    }
  });
});

describe('Listar e buscar composições', () => {
  it('filtra pela empresa da sessão e deixa as excluídas de fora', async () => {
    const { service, composition } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(composition.findMany.mock.calls[0]![0].where).toMatchObject({
      companyId: EMPRESA,
      deletedAt: null,
    });
  });

  it('busca por nome normalizado ou por código', async () => {
    const { service, composition } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'ALVENÁRIA' });
    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'comp-1' });

    const [primeira, segunda] = composition.findMany.mock.calls as unknown as [
      { where: { OR: [{ searchKey: { contains: string } }, { code: { contains: string } }] } },
    ][];
    expect(primeira![0].where.OR[0].searchKey.contains).toBe('alvenaria');
    expect(segunda![0].where.OR[1].code.contains).toBe('COMP-1');
  });

  it('o filtro de situação separa ativas de inativas', async () => {
    const { service, composition } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, active: 'false' });

    expect(composition.findMany.mock.calls[0]![0].where.active).toBe(false);
  });

  it('cada linha traz o custo unitário CALCULADO e a quantidade de itens', async () => {
    const { service } = makeService();
    await montarAlvenaria(service);

    const pagina = await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(pagina.data[0]).toMatchObject({
      code: 'COMP-0001',
      itemCount: 4,
      unitCost: '75.0000',
    });
    expect(pagina.data[0]).not.toHaveProperty('companyId');
  });
});

describe('Editar, ativar e desativar', () => {
  it('renomear atualiza a chave de busca junto', async () => {
    const { service, composicoes } = makeService();

    await service.update(EMPRESA, ALVENARIA, { name: 'Alvenaria estrutural' });

    expect(composicoes[0]).toMatchObject({
      name: 'Alvenaria estrutural',
      searchKey: 'alvenaria estrutural',
    });
  });

  it('desativar é edição de situação, não exclusão', async () => {
    const { service, composicoes } = makeService();

    const resposta = await service.update(EMPRESA, ALVENARIA, { active: false });

    expect(resposta.active).toBe(false);
    expect(composicoes[0]!.deletedAt).toBeNull();
  });

  it('reativar devolve ao uso', async () => {
    const { service } = makeService({ composicoes: [composicao({ active: false })] });

    const resposta = await service.update(EMPRESA, ALVENARIA, { active: true });

    expect(resposta.active).toBe(true);
  });

  it('editar composição de outra empresa dá "não encontrada" e nada grava', async () => {
    const { service, composition } = makeService({
      composicoes: [composicao({ companyId: OUTRA_EMPRESA })],
    });

    await expect(service.update(EMPRESA, ALVENARIA, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    expect(composition.update).not.toHaveBeenCalled();
  });
});

describe('Excluir composição', () => {
  it('é exclusão LÓGICA, com o código embaralhado', async () => {
    const { service, composicoes } = makeService();

    await service.remove(EMPRESA, ALVENARIA);

    expect(composicoes).toHaveLength(1);
    expect(composicoes[0]!.deletedAt).toBeInstanceOf(Date);
    expect(composicoes[0]!.code).toContain('__deleted__');
    await expect(service.findOne(EMPRESA, ALVENARIA)).rejects.toThrow(NotFoundException);
  });

  it('excluir composição de outra empresa dá "não encontrada"', async () => {
    const { service, composition } = makeService({
      composicoes: [composicao({ companyId: OUTRA_EMPRESA })],
    });

    await expect(service.remove(EMPRESA, ALVENARIA)).rejects.toThrow(NotFoundException);
    expect(composition.update).not.toHaveBeenCalled();
  });
});

describe('Itens e custo', () => {
  it('o exemplo do enunciado: material, mão de obra e equipamento dão R$ 75,00 por M2', async () => {
    const { service } = makeService();

    const detalhe = await montarAlvenaria(service);

    expect(detalhe.unit).toBe('M2');
    expect(detalhe.unitCost).toBe('75.0000');
    expect(
      detalhe.items.map((item) => [
        item.catalogItem.name,
        item.catalogItem.type,
        item.catalogItem.unit,
        item.coefficient,
        item.unitPrice,
        item.totalCost,
      ]),
    ).toEqual([
      ['Bloco cerâmico', 'MATERIAL', 'UN', '25.000000', '1.5000', '37.5000'],
      ['Pedreiro', 'LABOR', 'H', '0.800000', '30.0000', '24.0000'],
      ['Servente', 'LABOR', 'H', '0.600000', '20.0000', '12.0000'],
      ['Betoneira', 'EQUIPMENT', 'H', '0.100000', '15.0000', '1.5000'],
    ]);
  });

  it('o custo unitário é a soma dos custos dos itens', async () => {
    const { service } = makeService();

    const detalhe = await montarAlvenaria(service);

    const soma = detalhe.items.reduce(
      (total, item) => total.plus(item.totalCost),
      new Prisma.Decimal(0),
    );
    expect(soma.toFixed(4)).toBe(detalhe.unitCost);
  });

  it('o coeficiente é na unidade do INSUMO, sem conversão', async () => {
    // 12,5 KG de argamassa para 1 M2. Nada vira saco, metro cúbico ou grama.
    const { service, itens } = makeService();

    const detalhe = await incluir(service, ARGAMASSA, 12.5, 0.35);

    expect(itens[0]).not.toHaveProperty('unit');
    expect(detalhe.items[0]).toMatchObject({
      coefficient: '12.500000',
      totalCost: '4.3750',
      catalogItem: { unit: 'KG' },
    });
  });

  it('Decimal sem erro de ponto flutuante', async () => {
    // Em number, 0.1 × 3 = 0.30000000000000004.
    const { service } = makeService();

    const detalhe = await incluir(service, PEDREIRO, 0.1, 3);

    expect(detalhe.items[0]!.totalCost).toBe('0.3000');
    expect(detalhe.unitCost).toBe('0.3000');
  });

  it('o custo do item NUNCA vem do cliente', async () => {
    const { service, compositionItem } = makeService();

    const detalhe = await service.addItem(EMPRESA, ALVENARIA, {
      catalogItemId: BLOCO,
      coefficient: 25,
      unitPrice: 1.5,
      totalCost: 999,
    } as never);

    expect(compositionItem.create.mock.calls[0]![0].data).not.toHaveProperty('totalCost');
    expect(detalhe.items[0]!.totalCost).toBe('37.5000');
  });

  it('coeficiente zero é recusado, e nada é gravado', async () => {
    const { service, itens } = makeService();

    await expect(incluir(service, BLOCO, 0, 1.5)).rejects.toThrow(BadRequestException);
    expect(itens).toHaveLength(0);
  });

  it('coeficiente negativo é recusado', async () => {
    const { service, itens } = makeService();

    await expect(incluir(service, BLOCO, -2, 1.5)).rejects.toThrow(/maior que zero/);
    expect(itens).toHaveLength(0);
  });

  it('preço unitário negativo é recusado', async () => {
    const { service, itens } = makeService();

    await expect(incluir(service, BLOCO, 25, -1)).rejects.toThrow(/negativo/);
    expect(itens).toHaveLength(0);
  });

  it('preço unitário zero é aceito', async () => {
    const { service } = makeService();

    const detalhe = await incluir(service, BETONEIRA, 0.1, 0);

    expect(detalhe.items[0]!.totalCost).toBe('0.0000');
  });

  it('insumo de OUTRA empresa é recusado, e nada é gravado', async () => {
    // A FK do banco sozinha aceitaria: o insumo existe, só não é desta empresa.
    const { service, itens } = makeService();

    await expect(incluir(service, DA_OUTRA, 25, 1.5)).rejects.toThrow(BadRequestException);
    expect(itens).toHaveLength(0);
  });

  it('insumo INATIVO não entra em composição', async () => {
    const { service, itens } = makeService();

    await expect(incluir(service, INATIVO, 1, 20)).rejects.toThrow(/desativado/);
    expect(itens).toHaveLength(0);
  });

  it('insumo EXCLUÍDO não entra em composição', async () => {
    const { service, itens } = makeService();

    await expect(incluir(service, EXCLUIDO, 1, 90)).rejects.toThrow(BadRequestException);
    expect(itens).toHaveLength(0);
  });

  it('o mesmo insumo não entra duas vezes na mesma composição', async () => {
    const { service, itens } = makeService();
    await incluir(service, PEDREIRO, 0.8, 30);

    await expect(incluir(service, PEDREIRO, 0.2, 30)).rejects.toThrow(ConflictException);
    expect(itens).toHaveLength(1);
  });

  it('o mesmo insumo pode estar em composições diferentes, com preços diferentes', async () => {
    const { service } = makeService({
      composicoes: [composicao(), composicao({ id: CONTRAPISO, code: 'COMP-0002' })],
    });

    await incluir(service, PEDREIRO, 0.8, 30);
    const contrapiso = await incluir(service, PEDREIRO, 0.5, 35, CONTRAPISO);

    expect(contrapiso.items[0]).toMatchObject({ unitPrice: '35.0000', totalCost: '17.5000' });
    const alvenaria = await service.findOne(EMPRESA, ALVENARIA);
    expect(alvenaria.items[0]).toMatchObject({ unitPrice: '30.0000', totalCost: '24.0000' });
  });

  it('incluir item em composição de OUTRA empresa dá "não encontrada"', async () => {
    const { service, itens } = makeService({
      composicoes: [composicao({ companyId: OUTRA_EMPRESA })],
    });

    await expect(incluir(service, BLOCO, 25, 1.5)).rejects.toThrow(NotFoundException);
    expect(itens).toHaveLength(0);
  });

  it('atualizar o coeficiente recalcula o item e o custo unitário', async () => {
    const { service } = makeService();
    const montada = await montarAlvenaria(service);
    const pedreiro = montada.items.find((item) => item.catalogItemId === PEDREIRO)!;

    const detalhe = await service.updateItem(EMPRESA, ALVENARIA, pedreiro.id, { coefficient: 1 });

    expect(detalhe.items.find((item) => item.id === pedreiro.id)!.totalCost).toBe('30.0000');
    expect(detalhe.unitCost).toBe('81.0000');
  });

  it('atualizar o preço recalcula o item e o custo unitário', async () => {
    const { service } = makeService();
    const montada = await montarAlvenaria(service);
    const bloco = montada.items.find((item) => item.catalogItemId === BLOCO)!;

    const detalhe = await service.updateItem(EMPRESA, ALVENARIA, bloco.id, { unitPrice: 2 });

    expect(detalhe.items.find((item) => item.id === bloco.id)!.totalCost).toBe('50.0000');
    expect(detalhe.unitCost).toBe('87.5000');
  });

  it('atualizar para coeficiente inválido é recusado, e a linha fica como estava', async () => {
    const { service, itens } = makeService();
    const detalhe = await incluir(service, BLOCO, 25, 1.5);

    await expect(
      service.updateItem(EMPRESA, ALVENARIA, detalhe.items[0]!.id, { coefficient: 0 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateItem(EMPRESA, ALVENARIA, detalhe.items[0]!.id, { unitPrice: -5 }),
    ).rejects.toThrow(BadRequestException);
    expect(itens[0]!.coefficient.toString()).toBe('25');
    expect(itens[0]!.unitPrice.toString()).toBe('1.5');
  });

  it('insumo desativado DEPOIS de incluído continua editável na composição', async () => {
    // Desativar tira do uso NOVO. Travar a linha impediria corrigir o preço.
    const { service, insumos } = makeService();
    const detalhe = await incluir(service, PEDREIRO, 0.8, 30);
    insumos.find((i) => i.id === PEDREIRO)!.active = false;

    const atualizado = await service.updateItem(EMPRESA, ALVENARIA, detalhe.items[0]!.id, {
      unitPrice: 32,
    });

    expect(atualizado.items[0]).toMatchObject({
      totalCost: '25.6000',
      catalogItem: { active: false },
    });
  });

  it('item de OUTRA composição dá "não encontrado"', async () => {
    const { service } = makeService({
      composicoes: [composicao(), composicao({ id: CONTRAPISO, code: 'COMP-0002' })],
    });
    const contrapiso = await incluir(service, PEDREIRO, 0.5, 35, CONTRAPISO);

    await expect(
      service.updateItem(EMPRESA, ALVENARIA, contrapiso.items[0]!.id, { coefficient: 9 }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.removeItem(EMPRESA, ALVENARIA, contrapiso.items[0]!.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('remover o item recalcula o custo e registra quem tirou o quê', async () => {
    const { service, itens, auditoria } = makeService();
    const montada = await montarAlvenaria(service);
    const pedreiro = montada.items.find((item) => item.catalogItemId === PEDREIRO)!;

    const detalhe = await service.removeItem(EMPRESA, ALVENARIA, pedreiro.id);

    expect(itens).toHaveLength(3);
    expect(detalhe.unitCost).toBe('51.0000');
    expect(auditoria[0]).toMatchObject({
      companyId: EMPRESA,
      action: 'DELETE',
      entityType: 'CompositionItem',
      entityId: pedreiro.id,
      changes: {
        compositionId: ALVENARIA,
        catalogItemId: PEDREIRO,
        coefficient: '0.800000',
        unitPrice: '30.0000',
      },
    });
  });

  it('remover item de composição de OUTRA empresa dá "não encontrada"', async () => {
    const { service, composicoes, itens } = makeService();
    const detalhe = await incluir(service, BLOCO, 25, 1.5);
    composicoes[0]!.companyId = OUTRA_EMPRESA;

    await expect(service.removeItem(EMPRESA, ALVENARIA, detalhe.items[0]!.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(itens).toHaveLength(1);
  });
});

describe('O insumo muda no catálogo', () => {
  it('renomear o insumo NÃO altera coeficiente, preço nem custo da composição', async () => {
    const { service, insumosService } = makeService();
    await montarAlvenaria(service);

    await insumosService.update(EMPRESA, BLOCO, { name: 'Bloco cerâmico 9x19x39' });
    const detalhe = await service.findOne(EMPRESA, ALVENARIA);

    expect(detalhe.unitCost).toBe('75.0000');
    // A composição aponta por identidade: o nome novo aparece, a conta não muda.
    expect(detalhe.items[0]).toMatchObject({
      catalogItemId: BLOCO,
      coefficient: '25.000000',
      unitPrice: '1.5000',
      totalCost: '37.5000',
      catalogItem: { code: 'MAT-0001', name: 'Bloco cerâmico 9x19x39' },
    });
  });

  it('trocar a unidade de insumo usado em composição é recusado', async () => {
    // 12,5 KG de argamassa por M2 virariam 12,5 SC sem ninguém tocar na
    // composição.
    const { service, insumosService, insumos } = makeService();
    await incluir(service, ARGAMASSA, 12.5, 0.35);

    await expect(insumosService.update(EMPRESA, ARGAMASSA, { unit: 'SC' })).rejects.toThrow(
      /composições/,
    );
    expect(insumos.find((i) => i.id === ARGAMASSA)!.unit).toBe('KG');
  });

  it('insumo que só está em composição EXCLUÍDA troca de unidade normalmente', async () => {
    const { service, insumosService, insumos, composicoes } = makeService();
    await incluir(service, ARGAMASSA, 12.5, 0.35);
    composicoes[0]!.deletedAt = new Date();

    await insumosService.update(EMPRESA, ARGAMASSA, { unit: 'SC' });

    expect(insumos.find((i) => i.id === ARGAMASSA)!.unit).toBe('SC');
  });

  it('insumo usado em composição não pode ser excluído do catálogo', async () => {
    const { service, insumosService, insumos } = makeService();
    await incluir(service, PEDREIRO, 0.8, 30);

    await expect(insumosService.remove(EMPRESA, PEDREIRO)).rejects.toThrow(/Desative-o/);
    expect(insumos.find((i) => i.id === PEDREIRO)!.deletedAt).toBeNull();
  });
});

describe('Busca de insumo para incluir', () => {
  it('consulta só a empresa da sessão, só ativo e não excluído, sem preço', async () => {
    const { service, catalogItem } = makeService();

    await service.catalogOptions(EMPRESA, 'pedr');

    const args = catalogItem.findMany.mock.calls[0]![0] as unknown as {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    };
    expect(args.where).toMatchObject({ companyId: EMPRESA, deletedAt: null, active: true });
    expect(Object.keys(args.select).sort()).toEqual(['code', 'id', 'name', 'type', 'unit']);
  });

  it('termo vazio não consulta', async () => {
    const { service, catalogItem } = makeService();

    expect(await service.catalogOptions(EMPRESA, '  ')).toEqual([]);
    expect(catalogItem.findMany).not.toHaveBeenCalled();
  });

  it('o limite tem teto', async () => {
    const { service, catalogItem } = makeService();

    await service.catalogOptions(EMPRESA, 'b', 500);

    expect((catalogItem.findMany.mock.calls[0]![0] as unknown as { take: number }).take).toBe(20);
  });
});

describe('Isolamento entre empresas', () => {
  it('consultar composição de outra empresa dá "não encontrada"', async () => {
    const { service } = makeService({ composicoes: [composicao({ companyId: OUTRA_EMPRESA })] });

    await expect(service.findOne(EMPRESA, ALVENARIA)).rejects.toThrow(NotFoundException);
  });

  it('a composição de uma empresa não aparece na listagem da outra', async () => {
    const { service } = makeService({
      composicoes: [composicao(), composicao({ id: COMPOSICAO_DA_OUTRA, companyId: OUTRA_EMPRESA })],
    });

    const pagina = await service.findAll(OUTRA_EMPRESA, { page: 1, limit: 10 });

    expect(pagina.data.map((c) => c.id)).toEqual([COMPOSICAO_DA_OUTRA]);
  });
});

describe('Contrato de entrada', () => {
  const errosDe = (Classe: new () => object, corpo: object) =>
    validate(plainToInstance(Classe, corpo), { whitelist: true, forbidNonWhitelisted: true });

  it('mandar o custo do item no corpo é recusado', async () => {
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: 25,
      unitPrice: 1.5,
      totalCost: 37.5,
    });

    expect(erros.map((erro) => erro.property)).toContain('totalCost');
  });

  it('coeficiente com mais de seis casas e preço negativo são recusados', async () => {
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: 1.1234567,
      unitPrice: -1,
    });

    expect(erros.map((erro) => erro.property).sort()).toEqual(['coefficient', 'unitPrice']);
  });

  it('coeficiente minúsculo em notação científica é RECUSADO, não quebra a validação', async () => {
    // `String(0.0000001)` é "1e-7". O `@IsNumber({ maxDecimalPlaces })` do
    // class-validator lançava TypeError com isso — um 500 para o cliente.
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: 0.0000001,
      unitPrice: 1,
    });

    expect(erros).toHaveLength(1);
    expect(erros[0]!.property).toBe('coefficient');
    expect(Object.values(erros[0]!.constraints!)).toEqual([
      'O coeficiente aceita até 6 casas decimais.',
    ]);
  });

  it('coeficiente zero e preço com cinco casas dizem o motivo', async () => {
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: 0,
      unitPrice: 1.23456,
    });

    const mensagens = erros.flatMap((erro) => Object.values(erro.constraints ?? {}));
    expect(mensagens).toEqual(
      expect.arrayContaining([
        'O coeficiente deve ser maior que zero.',
        'O preço unitário aceita até 4 casas decimais.',
      ]),
    );
  });

  it('coeficiente e preço em texto numérico são aceitos', async () => {
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: '0.000123',
      unitPrice: '1.2345',
    });

    expect(erros).toHaveLength(0);
  });

  it('a menor fração aceita (0,000001) passa, mesmo escrita pelo JavaScript como 0.000001', async () => {
    const erros = await errosDe(CreateCompositionItemDto, {
      catalogItemId: BLOCO,
      coefficient: 0.000001,
      unitPrice: 0,
    });

    expect(erros).toHaveLength(0);
  });

  it('o texto numérico é gravado sem perder precisão', async () => {
    const { service, itens } = makeService();

    await incluir(service, ARGAMASSA, '0.000123', '50');

    expect(itens[0]!.coefficient.toString()).toBe('0.000123');
  });

  it('a linha não troca de insumo: remove-se e inclui-se outra', async () => {
    const erros = await errosDe(UpdateCompositionItemDto, { catalogItemId: PEDREIRO });

    expect(erros.map((erro) => erro.property)).toContain('catalogItemId');
  });

  it('a natureza do insumo não se edita', async () => {
    const erros = await errosDe(UpdateCatalogItemDto, { type: 'LABOR' });

    expect(erros.map((erro) => erro.property)).toContain('type');
  });
});
