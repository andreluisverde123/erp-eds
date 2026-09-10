import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { EmployeeAllocationsService } from './employee-allocations.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const ANDRE = '33333333-3333-3333-3333-333333333333';
const OBRA_TJ = '44444444-4444-4444-4444-444444444444';
const OBRA_TCE = '55555555-5555-5555-5555-555555555555';
const ALOCACAO = '66666666-6666-6666-6666-666666666666';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/// Só o que o dublê precisa entender do `where` que o service monta.
interface FiltroDeBusca {
  id?: string;
  startDate?: { lte?: Date };
}

interface LinhaAlocacao {
  id: string;
  employeeId: string;
  constructionSiteId: string;
  startDate: Date;
  endDate: Date | null;
  constructionSite: { name: string };
}

const alocacao = (
  id: string,
  obra: string,
  nome: string,
  inicio: string,
  fim?: string,
): LinhaAlocacao => ({
  id,
  employeeId: ANDRE,
  constructionSiteId: obra,
  startDate: dia(inicio),
  endDate: fim ? dia(fim) : null,
  constructionSite: { name: nome },
});

/// Dublê do Prisma. `existentes` é o histórico já gravado do colaborador —
/// é sobre ele que a regra de sobreposição decide.
function makeService(opcoes: {
  existentes?: LinhaAlocacao[];
  employeeStatus?: string;
  employeeCompanyId?: string;
  siteCompanyId?: string;
} = {}) {
  const {
    existentes = [],
    employeeStatus = 'ACTIVE',
    employeeCompanyId = EMPRESA,
    siteCompanyId = EMPRESA,
  } = opcoes;

  const criadas: Record<string, unknown>[] = [];
  const atualizadas: { id: string; data: Record<string, unknown> }[] = [];

  const employeeAllocation = {
    findMany: jest.fn(async () => existentes),
    // Usada pela transferência para achar a alocação de origem: a que cobre a
    // véspera do dia informado.
    findFirst: jest.fn(async ({ where }: { where: FiltroDeBusca }) => {
      if (where.id) {
        return existentes.find((a) => a.id === where.id) ?? null;
      }
      const limite = where.startDate?.lte;
      return (
        existentes
          .filter((a) => !limite || a.startDate <= limite)
          .filter((a) => !limite || a.endDate === null || a.endDate >= limite)
          .sort((x, y) => y.startDate.getTime() - x.startDate.getTime())[0] ?? null
      );
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      criadas.push(data);
      return { id: 'nova', ...data };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      atualizadas.push({ id: where.id, data });
      // Aplica a mudança na lista em memória. Dentro de uma transação, a
      // leitura seguinte enxerga o que a própria transação acabou de gravar —
      // é exatamente disso que a transferência depende: ela encerra a alocação
      // anterior e SÓ ENTÃO confere sobreposição.
      const alvo = existentes.find((a) => a.id === where.id);
      if (alvo && 'endDate' in data) {
        alvo.endDate = data.endDate as Date | null;
      }
      return { id: where.id, ...data };
    }),
    count: jest.fn(async () => existentes.length),
  };

  const prisma = {
    employeeAllocation,
    employee: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.companyId === employeeCompanyId ? { id: ANDRE, status: employeeStatus } : null,
      ),
    },
    constructionSite: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.companyId === siteCompanyId ? { id: OBRA_TCE } : null,
      ),
    },
    costCenter: { findFirst: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  const service = new EmployeeAllocationsService(prisma);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'nova' } as never);

  return { service, prisma, employeeAllocation, criadas, atualizadas };
}

const NOVA = {
  employeeId: ANDRE,
  constructionSiteId: OBRA_TCE,
  startDate: '2026-09-11',
};

describe('Sobreposição de períodos é recusada no backend', () => {
  it('período que cruza uma alocação existente é recusado', () => {
    const { service } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01', '2026-09-15')],
    });

    return expect(service.create(EMPRESA, { ...NOVA, startDate: '2026-09-10' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('a mensagem diz QUAL obra e QUE período conflitam', async () => {
    // Sem isso, a pessoa recebe "período sobreposto" e tem de caçar a alocação
    // antiga na mão.
    const { service } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01', '2026-09-15')],
    });

    await expect(service.create(EMPRESA, { ...NOVA, startDate: '2026-09-10' })).rejects.toThrow(
      /Obra TJ.*01\/09\/2026.*15\/09\/2026/,
    );
  });

  it('uma alocação ABERTA bloqueia qualquer período posterior', async () => {
    // O erro mais comum: criar a nova sem encerrar a anterior.
    const { service, criadas } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01')],
    });

    await expect(service.create(EMPRESA, NOVA)).rejects.toThrow(ConflictException);
    expect(criadas).toHaveLength(0);
  });

  it('alocação FUTURA já gravada também bloqueia', async () => {
    const { service } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-12-01', '2026-12-31')],
    });

    await expect(service.create(EMPRESA, { ...NOVA, startDate: '2026-11-01' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('período encostado no anterior é ACEITO', async () => {
    // 01→10 seguido de 11→… é a sequência correta; recusá-la tornaria a
    // transferência impossível.
    const { service, criadas } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01', '2026-09-10')],
    });

    await service.create(EMPRESA, NOVA);

    expect(criadas).toHaveLength(1);
  });

  it('a verificação e a escrita acontecem na MESMA transação', async () => {
    // Fora de uma transação com trava, dois pedidos simultâneos leem o mesmo
    // "sem conflito" e gravam os dois.
    const { service, prisma } = makeService();

    await service.create(EMPRESA, NOVA);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

describe('Transferência', () => {
  it('encerra a anterior na VÉSPERA e cria a nova no dia', async () => {
    const { service, criadas, atualizadas } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01')],
    });

    await service.transfer(EMPRESA, {
      employeeId: ANDRE,
      constructionSiteId: OBRA_TCE,
      date: '2026-09-11',
    });

    expect(atualizadas[0]).toMatchObject({ id: ALOCACAO, data: { endDate: dia('2026-09-10') } });
    expect(criadas[0]).toMatchObject({
      constructionSiteId: OBRA_TCE,
      startDate: dia('2026-09-11'),
    });
    // A nova nasce em ABERTO: é a obra atual até que outra transferência a
    // encerre.
    expect(criadas[0]!.endDate).toBeUndefined();
  });

  it('a obra anterior NÃO é sobrescrita — ela é encerrada', async () => {
    // O histórico é preservado por construção: a linha antiga continua
    // apontando para a obra antiga, só ganha uma data de fim.
    const { service, atualizadas } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01')],
    });

    await service.transfer(EMPRESA, {
      employeeId: ANDRE,
      constructionSiteId: OBRA_TCE,
      date: '2026-09-11',
    });

    expect(atualizadas[0]!.data.constructionSiteId).toBeUndefined();
    expect(atualizadas[0]!.data.deletedAt).toBeUndefined();
  });

  it('as duas escritas vivem na mesma transação', async () => {
    // Em dois pedidos separados, a falha do segundo deixaria o colaborador sem
    // obra nenhuma e nada avisaria.
    const { service, prisma } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01')],
    });

    await service.transfer(EMPRESA, {
      employeeId: ANDRE,
      constructionSiteId: OBRA_TCE,
      date: '2026-09-11',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('sem alocação anterior, apenas cria a nova', async () => {
    // Primeira obra do colaborador. Transferir de lugar nenhum é só alocar.
    const { service, criadas, atualizadas } = makeService();

    await service.transfer(EMPRESA, {
      employeeId: ANDRE,
      constructionSiteId: OBRA_TCE,
      date: '2026-09-11',
    });

    expect(atualizadas).toHaveLength(0);
    expect(criadas).toHaveLength(1);
  });

  it('a própria alocação de origem não é acusada de conflito', async () => {
    // Ela é encerrada ANTES da conferência; do contrário a transferência
    // esbarraria em si mesma e nunca passaria.
    const { service, criadas } = makeService({
      existentes: [alocacao(ALOCACAO, OBRA_TJ, 'Obra TJ', '2026-09-01')],
    });

    await service.transfer(EMPRESA, {
      employeeId: ANDRE,
      constructionSiteId: OBRA_TCE,
      date: '2026-09-11',
    });

    expect(criadas).toHaveLength(1);
  });
});

describe('Colaborador desligado', () => {
  it('não recebe alocação nova', async () => {
    const { service, criadas } = makeService({ employeeStatus: 'TERMINATED' });

    await expect(service.create(EMPRESA, NOVA)).rejects.toThrow(BadRequestException);
    expect(criadas).toHaveLength(0);
  });

  it('também não pode ser transferido', async () => {
    const { service, criadas } = makeService({ employeeStatus: 'TERMINATED' });

    await expect(
      service.transfer(EMPRESA, {
        employeeId: ANDRE,
        constructionSiteId: OBRA_TCE,
        date: '2026-09-11',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(criadas).toHaveLength(0);
  });

  it('quem está de férias ou afastado CONTINUA podendo ser alocado', async () => {
    // Férias e afastamento são temporários: a pessoa segue pertencendo à obra.
    // Só o desligamento encerra o vínculo.
    for (const status of ['VACATION', 'ON_LEAVE']) {
      const { service, criadas } = makeService({ employeeStatus: status });
      await service.create(EMPRESA, NOVA);
      expect(criadas).toHaveLength(1);
    }
  });
});

describe('Isolamento entre empresas', () => {
  it('funcionário de outra empresa não pode ser alocado', async () => {
    const { service, criadas } = makeService({ employeeCompanyId: OUTRA_EMPRESA });

    await expect(service.create(EMPRESA, NOVA)).rejects.toThrow(BadRequestException);
    expect(criadas).toHaveLength(0);
  });

  it('obra de outra empresa não recebe alocação', async () => {
    const { service, criadas } = makeService({ siteCompanyId: OUTRA_EMPRESA });

    await expect(service.create(EMPRESA, NOVA)).rejects.toThrow(BadRequestException);
    expect(criadas).toHaveLength(0);
  });

  it('transferir entre empresas diferentes é impossível', async () => {
    // Funcionário desta empresa, obra de outra.
    const { service, criadas } = makeService({ siteCompanyId: OUTRA_EMPRESA });

    await expect(
      service.transfer(EMPRESA, {
        employeeId: ANDRE,
        constructionSiteId: OBRA_TCE,
        date: '2026-09-11',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(criadas).toHaveLength(0);
  });

  it('a listagem só enxerga alocações da empresa da sessão', async () => {
    const { service, employeeAllocation } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(employeeAllocation.findMany.mock.calls.at(-1)![0].where).toMatchObject({
      employee: { companyId: EMPRESA },
      deletedAt: null,
    });
  });

  it('consultar alocação de outra empresa dá "não encontrada"', async () => {
    const { service, prisma } = makeService();
    (prisma.employeeAllocation.findFirst as jest.Mock).mockResolvedValueOnce(null);
    jest.spyOn(service, 'findOne').mockRestore();

    await expect(service.findOne(OUTRA_EMPRESA, ALOCACAO)).rejects.toThrow(NotFoundException);
  });
});

describe('Consulta por obra e data', () => {
  it('"quem estava na obra em 08/09" vira um intervalo de um dia', async () => {
    // É a consulta que o mestre de obras faz, e a base do RH-03.
    const { service, employeeAllocation } = makeService();

    await service.findAll(EMPRESA, {
      page: 1,
      limit: 10,
      constructionSiteId: OBRA_TJ,
      onDate: '2026-09-08',
    });

    const where = employeeAllocation.findMany.mock.calls.at(-1)![0].where;
    expect(where.constructionSiteId).toBe(OBRA_TJ);
    // Começou até o dia...
    expect(where.startDate).toEqual({ lte: dia('2026-09-08') });
    // ...e ainda não tinha terminado nele — alocação aberta incluída.
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: dia('2026-09-08') } }]);
  });

  it('um intervalo pega quem TOCA o período, não só quem cabe dentro', async () => {
    // Quem entrou em agosto e continua hoje deve aparecer numa consulta de
    // setembro — é o que quem pergunta espera.
    const { service, employeeAllocation } = makeService();

    await service.findAll(EMPRESA, {
      page: 1,
      limit: 10,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    const where = employeeAllocation.findMany.mock.calls.at(-1)![0].where;
    expect(where.startDate).toEqual({ lte: dia('2026-09-30') });
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: dia('2026-09-01') } }]);
  });

  it('sem filtro de data, o histórico inteiro é devolvido', async () => {
    const { service, employeeAllocation } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, employeeId: ANDRE });

    const where = employeeAllocation.findMany.mock.calls.at(-1)![0].where;
    expect(where.startDate).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });
});
