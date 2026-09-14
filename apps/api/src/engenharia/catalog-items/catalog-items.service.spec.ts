import { ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CatalogItemsService } from './catalog-items.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const INSUMO = '33333333-3333-3333-3333-333333333333';

const CIMENTO = { name: 'Cimento CP II 50kg', unit: 'SC' };

function makeService(
  opcoes: {
    gravado?: Record<string, unknown> | null;
    /// Quantos insumos já existem. Um número vale para qualquer natureza; um
    /// mapa separa a contagem por natureza.
    total?: number | Record<string, number>;
    usos?: number;
    emComposicoes?: number;
  } = {},
) {
  const {
    gravado = { id: INSUMO, companyId: EMPRESA, code: 'MAT-0001', searchKey: 'cimento' },
    total = 0,
    /// Quantas linhas de solicitação apontam para o insumo.
    usos = 0,
    /// Quantas linhas de composição apontam para o insumo.
    emComposicoes = 0,
  } = opcoes;

  const criados: Record<string, unknown>[] = [];
  const atualizados: Record<string, unknown>[] = [];
  let recusarDuplicado = false;

  const catalogItem = {
    count: jest.fn(async ({ where }: { where: { type?: string } }) =>
      typeof total === 'number' ? total : (total[where.type ?? ''] ?? 0),
    ),
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

  const purchaseRequestItem = { count: jest.fn(async () => usos) };
  const compositionItem = { count: jest.fn(async () => emComposicoes) };
  /// Quantos preços de referência o insumo tem. Zero por padrão; os testes de
  /// preço trocam com `mockResolvedValue`.
  const catalogItemPrice = { count: jest.fn(async () => 0) };

  const prisma = {
    catalogItem,
    purchaseRequestItem,
    compositionItem,
    catalogItemPrice,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new CatalogItemsService(prisma);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: INSUMO } as never);

  return {
    service,
    catalogItem,
    purchaseRequestItem,
    compositionItem,
    catalogItemPrice,
    criados,
    atualizados,
    duplicar: () => {
      recusarDuplicado = true;
    },
  };
}

describe('Insumo com preço de referência (ORC-03)', () => {
  const CIMENTO_EM_SACO = { id: INSUMO, companyId: EMPRESA, code: 'MAT-0001', unit: 'SC' };

  it('trocar a unidade é recusado: R$ 38,00 por SC não vira R$ 38,00 por KG', async () => {
    const { service, atualizados, catalogItemPrice } = makeService({ gravado: CIMENTO_EM_SACO });
    catalogItemPrice.count.mockResolvedValue(2);

    await expect(service.update(EMPRESA, INSUMO, { unit: 'KG' })).rejects.toThrow(
      /preços de referência/,
    );
    expect(atualizados).toHaveLength(0);
    expect(catalogItemPrice.count).toHaveBeenCalledWith({ where: { catalogItemId: INSUMO } });
  });

  it('renomear continua permitido', async () => {
    const { service, atualizados, catalogItemPrice } = makeService({ gravado: CIMENTO_EM_SACO });
    catalogItemPrice.count.mockResolvedValue(2);

    await service.update(EMPRESA, INSUMO, { name: 'Cimento CP II-E 50kg', unit: 'SC' });

    expect(atualizados).toHaveLength(1);
  });

  it('não pode ser excluído — o histórico sumiria de vista', async () => {
    const { service, atualizados, catalogItemPrice } = makeService();
    catalogItemPrice.count.mockResolvedValue(1);

    await expect(service.remove(EMPRESA, INSUMO)).rejects.toThrow(/Desative-o/);
    expect(atualizados).toHaveLength(0);
  });

  it('continua sem preço no próprio cadastro', async () => {
    const { service, criados } = makeService();

    await service.create(EMPRESA, { name: 'Cimento', unit: 'SC' });

    expect(Object.keys(criados[0]!).filter((campo) => /price|preco|cost/i.test(campo))).toEqual([]);
  });
});

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

describe('Naturezas do insumo', () => {
  it('sem natureza informada, continua MATERIAL com código MAT-', async () => {
    // É o caminho de todo insumo cadastrado antes do ORC-02, e da tela antiga.
    const { service, criados } = makeService();

    await service.create(EMPRESA, CIMENTO);

    expect(criados[0]).toMatchObject({ type: 'MATERIAL', code: 'MAT-0001' });
  });

  it('mão de obra recebe o prefixo MO- e sequência própria', async () => {
    const { service, criados, catalogItem } = makeService({ total: { MATERIAL: 41 } });

    await service.create(EMPRESA, { name: 'Pedreiro', unit: 'H', type: 'LABOR' });

    expect(criados[0]).toMatchObject({ type: 'LABOR', code: 'MO-0001', unit: 'H' });
    expect(catalogItem.count).toHaveBeenCalledWith({
      where: { companyId: EMPRESA, type: 'LABOR' },
    });
  });

  it('equipamento recebe o prefixo EQP-', async () => {
    const { service, criados } = makeService({ total: { EQUIPMENT: 2 } });

    await service.create(EMPRESA, { name: 'Betoneira 400L', unit: 'H', type: 'EQUIPMENT' });

    expect(criados[0]).toMatchObject({ type: 'EQUIPMENT', code: 'EQP-0003' });
  });

  it('cadastrar mão de obra não empurra a numeração dos materiais', async () => {
    const { service, criados } = makeService({ total: { MATERIAL: 7, LABOR: 30 } });

    await service.create(EMPRESA, CIMENTO);

    expect(criados[0]!.code).toBe('MAT-0008');
  });

  it('nenhuma natureza grava preço', async () => {
    const { service, criados } = makeService();

    await service.create(EMPRESA, { name: 'Pedreiro', unit: 'H', type: 'LABOR' });
    await service.create(EMPRESA, { name: 'Betoneira', unit: 'H', type: 'EQUIPMENT' });

    for (const criado of criados) {
      for (const campo of ['price', 'unitPrice', 'cost', 'hourlyRate']) {
        expect(criado).not.toHaveProperty(campo);
      }
    }
  });

  it('o filtro por natureza chega à consulta', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, type: 'LABOR' });

    expect(catalogItem.findMany.mock.calls[0]![0].where.type).toBe('LABOR');
  });

  it('editar não troca a natureza', async () => {
    // Ela escolheu o prefixo do código; o DTO de edição nem a aceita.
    const { service, atualizados } = makeService();

    await service.update(EMPRESA, INSUMO, { name: 'Cimento CP V', type: 'LABOR' } as never);

    expect(atualizados[0]).not.toHaveProperty('type');
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

describe('Insumo usado em composição', () => {
  const ARGAMASSA = { id: INSUMO, companyId: EMPRESA, code: 'MAT-0002', unit: 'KG' };

  it('trocar a unidade é recusado: o coeficiente da composição está nela', async () => {
    const { service, atualizados, compositionItem } = makeService({
      gravado: ARGAMASSA,
      emComposicoes: 2,
    });

    await expect(service.update(EMPRESA, INSUMO, { unit: 'SC' })).rejects.toThrow(/composições/);
    expect(atualizados).toHaveLength(0);
    // Composição excluída não conta: ninguém lê o coeficiente dela.
    expect(compositionItem.count).toHaveBeenCalledWith({
      where: { catalogItemId: INSUMO, composition: { deletedAt: null } },
    });
  });

  it('reenviar a MESMA unidade não é troca', async () => {
    // O formulário de edição manda todos os campos de volta.
    const { service, atualizados, compositionItem } = makeService({
      gravado: ARGAMASSA,
      emComposicoes: 2,
    });

    await service.update(EMPRESA, INSUMO, { name: 'Argamassa AC-III', unit: 'KG' });

    expect(compositionItem.count).not.toHaveBeenCalled();
    expect(atualizados[0]).toMatchObject({ name: 'Argamassa AC-III', unit: 'KG' });
  });

  it('renomear e desativar continuam permitidos', async () => {
    const { service, atualizados } = makeService({ gravado: ARGAMASSA, emComposicoes: 2 });

    await service.update(EMPRESA, INSUMO, { name: 'Argamassa colante' });
    await service.update(EMPRESA, INSUMO, { active: false });

    expect(atualizados).toHaveLength(2);
  });

  it('não pode ser excluído — é desativado', async () => {
    const { service, atualizados } = makeService({ emComposicoes: 1 });

    await expect(service.remove(EMPRESA, INSUMO)).rejects.toThrow(/Desative-o/);
    expect(atualizados).toHaveLength(0);
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

  it('a linha não sai da tabela', async () => {
    const { service, catalogItem } = makeService();

    await service.remove(EMPRESA, INSUMO);

    expect(catalogItem.update).toHaveBeenCalled();
    expect(catalogItem).not.toHaveProperty('delete');
  });

  it('insumo JÁ USADO em solicitação não é excluído — é desativado', async () => {
    // Excluir embaralha o código, e o código é a identidade que a linha de
    // compra aponta. O histórico não pode ver "MAT-0001__deleted__<uuid>".
    const { service, atualizados, purchaseRequestItem } = makeService({ usos: 3 });

    await expect(service.remove(EMPRESA, INSUMO)).rejects.toThrow(/Desative-o/);
    expect(atualizados).toHaveLength(0);
    expect(purchaseRequestItem.count).toHaveBeenCalledWith({ where: { catalogItemId: INSUMO } });
  });

  it('desativar insumo usado continua permitido', async () => {
    const { service, atualizados } = makeService({ usos: 3 });

    await service.update(EMPRESA, INSUMO, { active: false });

    expect(atualizados[0]!.active).toBe(false);
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

  it('o código sequencial conta só a própria empresa, na natureza do insumo', async () => {
    const { service, catalogItem } = makeService();

    await service.create(EMPRESA, CIMENTO);

    expect(catalogItem.count.mock.calls[0]![0]).toEqual({
      where: { companyId: EMPRESA, type: 'MATERIAL' },
    });
  });

  it('o MESMO código é permitido em empresas diferentes', async () => {
    // A unique é `(companyId, code)`: cada empresa começa em MAT-0001.
    const primeira = makeService({ total: 0 });
    const segunda = makeService({ total: 0 });

    await primeira.service.create(EMPRESA, CIMENTO);
    await segunda.service.create(OUTRA_EMPRESA, CIMENTO);

    expect(primeira.criados[0]).toMatchObject({ companyId: EMPRESA, code: 'MAT-0001' });
    expect(segunda.criados[0]).toMatchObject({ companyId: OUTRA_EMPRESA, code: 'MAT-0001' });
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

  it('tolera acento nos dois sentidos: digitado com acento acha gravado sem, e vice-versa', async () => {
    const { service, catalogItem } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'Tubo  Conexão' });
    await service.findAll(EMPRESA, { page: 1, limit: 10, search: 'tubo conexao' });

    // As duas digitações chegam à MESMA chave — a que `searchKey` grava.
    const chamadas = catalogItem.findMany.mock.calls as unknown as [
      { where: { OR: [{ searchKey: { contains: string } }] } },
    ][];
    const chaves = chamadas.map(([args]) => args.where.OR[0].searchKey.contains);
    expect(chaves).toEqual(['tubo conexao', 'tubo conexao']);
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
