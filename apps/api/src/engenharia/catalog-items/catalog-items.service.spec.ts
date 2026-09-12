import { ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CatalogItemsService } from './catalog-items.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const INSUMO = '33333333-3333-3333-3333-333333333333';

const CIMENTO = { name: 'Cimento CP II 50kg', unit: 'SC' };

function makeService(opcoes: { gravado?: Record<string, unknown> | null; total?: number } = {}) {
  const {
    gravado = { id: INSUMO, companyId: EMPRESA, code: 'MAT-0001', searchKey: 'cimento' },
    total = 0,
  } = opcoes;

  const criados: Record<string, unknown>[] = [];
  const atualizados: Record<string, unknown>[] = [];
  let recusarDuplicado = false;

  const catalogItem = {
    count: jest.fn(async () => total),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      gravado && where.companyId === gravado.companyId ? gravado : null,
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (recusarDuplicado) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '7',
        });
      }
      criados.push(data);
      return { id: INSUMO, ...data };
    }),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      // A mesma unique protege a edição: renomear para um nome já usado colide
      // exatamente como criar.
      if (recusarDuplicado && data.searchKey !== undefined) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '7',
        });
      }
      atualizados.push(data);
      return { id: INSUMO, ...data };
    }),
  };

  const prisma = {
    catalogItem,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new CatalogItemsService(prisma);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: INSUMO } as never);

  return {
    service,
    catalogItem,
    criados,
    atualizados,
    duplicar: () => {
      recusarDuplicado = true;
    },
  };
}

describe('Cadastrar insumo', () => {
  it('grava nome, unidade e a empresa da SESSÃO', async () => {
    const { service, criados } = makeService();

    await service.create(EMPRESA, { ...CIMENTO, companyId: OUTRA_EMPRESA } as never);

    // O `companyId` do corpo é ignorado: quem manda é a sessão.
    expect(criados[0]).toMatchObject({
      companyId: EMPRESA,
      name: 'Cimento CP II 50kg',
      unit: 'SC',
    });
  });

  it('o código é sequencial por empresa, gerado no servidor', async () => {
    // Mesmo gerador de SOL-0001 e OC-0001 — nenhuma segunda implementação.
    const { service, criados } = makeService({ total: 41 });

    await service.create(EMPRESA, CIMENTO);

    expect(criados[0]!.code).toBe('MAT-0042');
  });

  it('a chave de busca é derivada do nome, nunca recebida', async () => {
    const { service, criados } = makeService();

    await service.create(EMPRESA, { name: '  Cimento   CP  II  ', unit: 'SC' });

    expect(criados[0]!.searchKey).toBe('cimento cp ii');
    expect(criados[0]!.name).toBe('Cimento   CP  II');
  });

  it('categoria e descrição em branco viram nulo, não string vazia', async () => {
    const { service, criados } = makeService();

    await service.create(EMPRESA, { ...CIMENTO, category: '   ', description: '' });

    expect(criados[0]!.category).toBeNull();
    expect(criados[0]!.description).toBeNull();
  });

  it('nome duplicado é recusado com mensagem, não com erro cru do banco', async () => {
    // A regra é determinística: mesmo nome normalizado, mesmo insumo. A unique
    // `(empresa, searchKey)` é quem recusa — conferir antes com um `findFirst`
    // deixaria uma janela entre a checagem e a escrita.
    const { service, duplicar } = makeService();
    duplicar();

    await expect(service.create(EMPRESA, CIMENTO)).rejects.toThrow(ConflictException);
  });

  it('NÃO grava preço nenhum', async () => {
    // O catálogo responde "o que é este insumo", nunca "quanto custa". Preço
    // tem quatro naturezas no ERP e nenhuma pertence a um cadastro.
    const { service, criados } = makeService();

    await service.create(EMPRESA, CIMENTO);

    for (const campo of ['price', 'unitPrice', 'cost', 'averagePrice']) {
      expect(criados[0]).not.toHaveProperty(campo);
    }
  });
});

describe('Editar insumo', () => {
  it('renomear atualiza a chave de busca junto', async () => {
    // Sem isto, a busca continuaria achando pelo nome antigo e a unique
    // deixaria de valer.
    const { service, atualizados } = makeService();

    await service.update(EMPRESA, INSUMO, { name: 'Cimento CP V ARI' });

    expect(atualizados[0]).toMatchObject({
      name: 'Cimento CP V ARI',
      searchKey: 'cimento cp v ari',
    });
  });

  it('editar só a unidade não mexe na chave', async () => {
    const { service, atualizados } = makeService();

    await service.update(EMPRESA, INSUMO, { unit: 'KG' });

    expect(atualizados[0]!.searchKey).toBeUndefined();
    expect(atualizados[0]!.unit).toBe('KG');
  });

  it('desativar é uma edição de situação, não exclusão', async () => {
    const { service, atualizados } = makeService();

    await service.update(EMPRESA, INSUMO, { active: false });

    expect(atualizados[0]!.active).toBe(false);
    expect(atualizados[0]!.deletedAt).toBeUndefined();
  });

  it('renomear para um nome já usado é recusado', async () => {
    // A mesma unique `(empresa, searchKey)` protege a edição.
    const { service, duplicar } = makeService();
    duplicar();

    await expect(service.update(EMPRESA, INSUMO, { name: 'Cimento CP II 50kg' })).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('Excluir insumo', () => {
  it('é exclusão LÓGICA e embaralha código e chave', async () => {
    // As duas uniques não ignoram `deletedAt`: sem embaralhar, o insumo
    // excluído bloquearia para sempre o nome e o número dele.
    const { service, atualizados } = makeService();

    await service.remove(EMPRESA, INSUMO);

    expect(atualizados[0]!.deletedAt).toBeInstanceOf(Date);
    expect(String(atualizados[0]!.code)).toContain('__deleted__');
    expect(String(atualizados[0]!.searchKey)).toContain('__deleted__');
  });

  it('a linha não sai da tabela — o histórico de compras continua apontando', async () => {
    const { service, catalogItem } = makeService();

    await service.remove(EMPRESA, INSUMO);

    expect(catalogItem.update).toHaveBeenCalled();
    expect(catalogItem).not.toHaveProperty('delete');
  });
});

describe('Isolamento entre empresas', () => {
  it('consultar insumo de outra empresa dá "não encontrado"', async () => {
    const { service } = makeService({ gravado: { id: INSUMO, companyId: OUTRA_EMPRESA } });
    jest.spyOn(service, 'findOne').mockRestore();

    await expect(service.findOne(EMPRESA, INSUMO)).rejects.toThrow(NotFoundException);
  });

  it('editar insumo de outra empresa dá "não encontrado"', async () => {
    const { service, atualizados } = makeService({
      gravado: { id: INSUMO, companyId: OUTRA_EMPRESA },
    });

    await expect(service.update(EMPRESA, INSUMO, { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(atualizados).toHaveLength(0);
  });

  it('excluir insumo de outra empresa dá "não encontrado"', async () => {
    const { service, atualizados } = makeService({
      gravado: { id: INSUMO, companyId: OUTRA_EMPRESA },
    });

    await expect(service.remove(EMPRESA, INSUMO)).rejects.toThrow(NotFoundException);
    expect(atualizados).toHaveLength(0);
  });

  it('a listagem sempre filtra pela empresa da sessão', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(catalogItem.findMany.mock.calls[0]![0].where).toMatchObject({
      companyId: EMPRESA,
      deletedAt: null,
    });
  });

  it('o código sequencial conta só a própria empresa', async () => {
    const { service, catalogItem } = makeService();

    await service.create(EMPRESA, CIMENTO);

    expect(catalogItem.count.mock.calls[0]![0]).toEqual({ where: { companyId: EMPRESA } });
  });
});

describe('Busca', () => {
  it('por nome, normalizando os dois lados', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'CIMENTÖ' });

    expect(catalogItem.findMany.mock.calls[0]![0].where.OR[0]).toEqual({
      searchKey: { contains: 'cimento' },
    });
  });

  it('por código, em caixa alta', async () => {
    // É assim que o código é gravado, e quem digita escreve "mat-1".
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'mat-0001' });

    expect(catalogItem.findMany.mock.calls[0]![0].where.OR[1]).toMatchObject({
      code: { contains: 'MAT-0001' },
    });
  });

  it('curinga do LIKE é escapado', async () => {
    // Sem isto, digitar `%` sugeriria o catálogo inteiro.
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, search: '100%' });

    expect(catalogItem.findMany.mock.calls[0]![0].where.OR[0].searchKey.contains).toBe('100\\%');
  });

  it('sem termo, nenhum filtro de texto entra', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(catalogItem.findMany.mock.calls[0]![0].where.OR).toBeUndefined();
  });

  it('insumo excluído fica fora da listagem operacional', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(catalogItem.findMany.mock.calls[0]![0].where.deletedAt).toBeNull();
  });

  it('o filtro de situação separa ativos de inativos', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, active: 'true' });

    expect(catalogItem.findMany.mock.calls[0]![0].where.active).toBe(true);
  });

  it('sem filtro de situação, vêm os dois', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(catalogItem.findMany.mock.calls[0]![0].where.active).toBeUndefined();
  });
});
