import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from './attendance.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const ANDRE = '33333333-3333-3333-3333-333333333333';
const CARLOS = '44444444-4444-4444-4444-444444444444';
const OBRA_TJ = '55555555-5555-5555-5555-555555555555';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Cadastro {
  id: string;
  compensationType?: string;
  dailyRate?: string | null;
}

interface Opcoes {
  cadastro?: Cadastro[];
  snapshots?: { employeeId: string; dailyRateApplied: string | null }[];
  alocados?: { id: string; name: string; position: string; status?: string; terminationDate?: Date | null }[];
  presencas?: { employeeId: string; present: boolean; date?: Date }[];
  siteCompanyId?: string;
  funcionariosDoTenant?: string[];
}

function makeService(opcoes: Opcoes = {}) {
  const {
    alocados = [],
    presencas = [],
    siteCompanyId = EMPRESA,
    funcionariosDoTenant,
    cadastro = [],
    snapshots = [],
  } = opcoes;

  const upserts: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }[] = [];

  const employeeAttendance = {
    // A leitura de snapshots (`select: { dailyRateApplied }`) é diferente da
    // leitura da chamada (`select: { present }`).
    findMany: jest.fn(async ({ select }: { select?: Record<string, unknown> }) =>
      select?.dailyRateApplied
        ? snapshots
        : presencas.map((p) => ({ ...p, date: p.date ?? dia('2026-09-08') })),
    ),
    count: jest.fn(async () => presencas.length),
    upsert: jest.fn((args: (typeof upserts)[number]) => {
      upserts.push(args);
      return Promise.resolve({ id: 'x' });
    }),
  };

  const prisma = {
    employeeAttendance,
    employeeAllocation: {
      findMany: jest.fn(async () =>
        alocados.map((a) => ({
          employee: {
            id: a.id,
            name: a.name,
            position: a.position,
            status: a.status ?? 'ACTIVE',
            terminationDate: a.terminationDate ?? null,
          },
        })),
      ),
    },
    employee: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] }; companyId: string } }) => {
        const permitidos = funcionariosDoTenant ?? where.id.in;
        if (where.companyId !== EMPRESA) return [];
        return where.id.in
          .filter((id) => permitidos.includes(id))
          .map((id) => {
            const registro = cadastro.find((c) => c.id === id);
            return {
              id,
              compensationType: registro?.compensationType ?? 'CLT',
              dailyRate: registro?.dailyRate ?? null,
            };
          });
      }),
    },
    constructionSite: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === siteCompanyId ? { id: OBRA_TJ } : null,
      ),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  return { service: new AttendanceService(prisma), prisma, employeeAttendance, upserts };
}

const EQUIPE = [
  { id: ANDRE, name: 'André', position: 'Pedreiro' },
  { id: CARLOS, name: 'Carlos', position: 'Servente' },
];

const DIA = { constructionSiteId: OBRA_TJ, date: '2026-09-08' };

describe('Carregar a chamada do dia', () => {
  it('os candidatos vêm da ALOCAÇÃO, não do cadastro inteiro', async () => {
    // Numa obra de vinte pessoas, listar os duzentos funcionários da
    // construtora transformaria o apontamento numa caça ao nome.
    const { service, prisma } = makeService({ alocados: EQUIPE });

    const chamada = await service.day(EMPRESA, DIA);

    expect(chamada.rows.map((r) => r.name)).toEqual(['André', 'Carlos']);
    expect(prisma.employeeAllocation.findMany).toHaveBeenCalled();
  });

  it('a alocação é filtrada pela obra e pela data', async () => {
    const { service, prisma } = makeService({ alocados: EQUIPE });

    await service.day(EMPRESA, DIA);

    const where = (prisma.employeeAllocation.findMany as jest.Mock).mock.calls[0]![0].where;
    expect(where.constructionSiteId).toBe(OBRA_TJ);
    expect(where.startDate).toEqual({ lte: dia('2026-09-08') });
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: dia('2026-09-08') } }]);
    expect(where.employee).toMatchObject({ companyId: EMPRESA });
  });

  it('quem já foi apontado vem com a situação registrada', async () => {
    const { service } = makeService({
      alocados: EQUIPE,
      presencas: [{ employeeId: ANDRE, present: true }],
    });

    const chamada = await service.day(EMPRESA, DIA);

    expect(chamada.rows.find((r) => r.employeeId === ANDRE)!.situacao).toBe('PRESENTE');
    expect(chamada.rows.find((r) => r.employeeId === CARLOS)!.situacao).toBe('NAO_APONTADO');
  });

  it('obra de outra empresa é recusada', async () => {
    const { service } = makeService({ siteCompanyId: OUTRA_EMPRESA });

    await expect(service.day(EMPRESA, DIA)).rejects.toThrow(BadRequestException);
  });
});

describe('Salvar a chamada', () => {
  it('grava uma linha por colaborador, com obra e dia', async () => {
    const { service, upserts } = makeService({ alocados: EQUIPE });

    await service.saveDay(EMPRESA, {
      ...DIA,
      entries: [
        { employeeId: ANDRE, present: true },
        { employeeId: CARLOS, present: false },
      ],
    });

    expect(upserts).toHaveLength(2);
    expect(upserts[0]!.create).toMatchObject({
      employeeId: ANDRE,
      constructionSiteId: OBRA_TJ,
      date: dia('2026-09-08'),
      present: true,
    });
    expect(upserts[1]!.create).toMatchObject({ employeeId: CARLOS, present: false });
  });

  it('salvar o mesmo dia de novo ATUALIZA, não duplica', async () => {
    // É `upsert` na chave `(funcionário, dia)`: reenviar o mesmo apontamento
    // deixa o sistema igual, e dois responsáveis salvando ao mesmo tempo
    // terminam com uma linha por pessoa em vez de registros contraditórios.
    const { service, upserts } = makeService({ alocados: EQUIPE });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.where).toEqual({
      employeeId_date: { employeeId: ANDRE, date: dia('2026-09-08') },
    });
    expect(upserts[0]!.update).toMatchObject({ present: true });
  });

  it('corrigir de ausente para presente é uma edição do mesmo registro', async () => {
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      presencas: [{ employeeId: ANDRE, present: false }],
    });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.update).toMatchObject({ present: true });
  });

  it('o dia inteiro vai numa transação só', async () => {
    // Meio dia apontado é pior que nenhum.
    const { service, prisma } = makeService({ alocados: EQUIPE });

    await service.saveDay(EMPRESA, {
      ...DIA,
      entries: [
        { employeeId: ANDRE, present: true },
        { employeeId: CARLOS, present: true },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('o mesmo colaborador duas vezes no corpo é recusado', async () => {
    // Duas linhas contraditórias para a mesma pessoa no mesmo pedido: a
    // constraint pegaria, mas o erro sairia ilegível.
    const { service, upserts } = makeService({ alocados: EQUIPE });

    await expect(
      service.saveDay(EMPRESA, {
        ...DIA,
        entries: [
          { employeeId: ANDRE, present: true },
          { employeeId: ANDRE, present: false },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(upserts).toHaveLength(0);
  });

  it('faltar NÃO mexe na alocação', async () => {
    // A alocação diz onde a pessoa deveria estar; a falta é um fato sobre o
    // dia. Encerrar alocação por ausência apagaria a intenção do mês inteiro.
    const { service, prisma } = makeService({ alocados: EQUIPE });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: false }] });

    expect(prisma.employeeAllocation).not.toHaveProperty('update');
    expect((prisma.employeeAllocation.findMany as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('Isolamento entre empresas', () => {
  it('colaborador de outra empresa no corpo derruba o apontamento inteiro', async () => {
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      funcionariosDoTenant: [ANDRE],
    });

    await expect(
      service.saveDay(EMPRESA, {
        ...DIA,
        entries: [
          { employeeId: ANDRE, present: true },
          { employeeId: CARLOS, present: true },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(upserts).toHaveLength(0);
  });

  it('obra de outra empresa não recebe apontamento', async () => {
    const { service, upserts } = makeService({ siteCompanyId: OUTRA_EMPRESA });

    await expect(
      service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] }),
    ).rejects.toThrow(BadRequestException);
    expect(upserts).toHaveLength(0);
  });

  it('a listagem sempre filtra pela empresa da sessão', async () => {
    const { service, employeeAttendance } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(employeeAttendance.findMany.mock.calls.at(-1)![0].where.employee).toEqual({
      companyId: EMPRESA,
    });
  });

  it('a contagem de dias também', async () => {
    const { service, employeeAttendance } = makeService();

    await service.summary(EMPRESA, { page: 1, limit: 10, employeeId: ANDRE });

    expect(employeeAttendance.findMany.mock.calls.at(-1)![0].where.employee).toEqual({
      companyId: EMPRESA,
    });
  });
});

describe('Histórico e contagem', () => {
  it('conta os dias trabalhados no período — e só isso', async () => {
    // O caso do André: 08 presente, 09 ausente, 10 presente.
    const { service } = makeService({
      presencas: [
        { employeeId: ANDRE, present: true, date: dia('2026-09-08') },
        { employeeId: ANDRE, present: false, date: dia('2026-09-09') },
        { employeeId: ANDRE, present: true, date: dia('2026-09-10') },
      ],
    });

    const resumo = await service.summary(EMPRESA, {
      page: 1,
      limit: 10,
      employeeId: ANDRE,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(resumo).toEqual({ daysPresent: 2, daysAbsent: 1, daysRecorded: 3 });
    // Nenhum valor monetário aparece na resposta: quanto vale um dia é o RH-04.
    expect(Object.keys(resumo)).not.toContain('amount');
  });

  it('o intervalo vira filtro de data', async () => {
    const { service, employeeAttendance } = makeService();

    await service.findAll(EMPRESA, {
      page: 1,
      limit: 10,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(employeeAttendance.findMany.mock.calls.at(-1)![0].where.date).toEqual({
      gte: dia('2026-09-01'),
      lte: dia('2026-09-30'),
    });
  });

  it('o filtro de presença separa quem trabalhou de quem faltou', async () => {
    const { service, employeeAttendance } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10, present: 'true' });

    expect(employeeAttendance.findMany.mock.calls.at(-1)![0].where.present).toBe(true);
  });

  it('sem filtro de presença, vêm as duas situações', async () => {
    const { service, employeeAttendance } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(employeeAttendance.findMany.mock.calls.at(-1)![0].where.present).toBeUndefined();
  });
});


/// A DIÁRIA CONGELADA no apontamento.
///
/// `Employee.dailyRate` guarda um valor só, sem vigência. Sem o congelamento,
/// reajustar a diária em outubro recalcularia setembro — silenciosamente, e o
/// erro só apareceria na conferência do mês fechado.
describe('Congelamento da diária', () => {
  const DIARISTA = { id: ANDRE, compensationType: 'DAILY', dailyRate: '180.00' };

  it('presença de diarista guarda a diária vigente', async () => {
    const { service, upserts } = makeService({ alocados: EQUIPE, cadastro: [DIARISTA] });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.create.dailyRateApplied).toBe('180.00');
  });

  it('CLT não guarda diária nenhuma', async () => {
    // Um número aqui seria lido como verdade pelo cálculo de custo.
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      cadastro: [{ id: CARLOS, compensationType: 'CLT' }],
    });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: CARLOS, present: true }] });

    expect(upserts[0]!.create.dailyRateApplied).toBeNull();
  });

  it('a diária JÁ congelada não é reescrita', async () => {
    // Reapontar um dia antigo depois de um reajuste não pode mudar o passado.
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      cadastro: [{ ...DIARISTA, dailyRate: '200.00' }],
      snapshots: [{ employeeId: ANDRE, dailyRateApplied: '180.00' }],
    });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.update.dailyRateApplied).toBe('180.00');
  });

  it('ausente que vira presente usa a diária vigente', async () => {
    // Não havia snapshot: o dia nunca gerou custo. Agora gera, pelo valor de
    // hoje — que é a regra definida.
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      cadastro: [DIARISTA],
      snapshots: [{ employeeId: ANDRE, dailyRateApplied: null }],
    });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.update.dailyRateApplied).toBe('180.00');
  });

  it('o cliente NÃO consegue mandar uma diária arbitrária', async () => {
    // O corpo do pedido nem tem esse campo: quem decide o valor é o backend.
    const { service, upserts } = makeService({ alocados: EQUIPE, cadastro: [DIARISTA] });

    await service.saveDay(EMPRESA, {
      ...DIA,
      entries: [{ employeeId: ANDRE, present: true, dailyRateApplied: '9999.00' } as never],
    });

    expect(upserts[0]!.create.dailyRateApplied).toBe('180.00');
  });

  it('diarista sem diária no cadastro fica sem snapshot — desconhecido, não zero', async () => {
    const { service, upserts } = makeService({
      alocados: EQUIPE,
      cadastro: [{ id: ANDRE, compensationType: 'DAILY', dailyRate: null }],
    });

    await service.saveDay(EMPRESA, { ...DIA, entries: [{ employeeId: ANDRE, present: true }] });

    expect(upserts[0]!.create.dailyRateApplied).toBeNull();
  });
});
