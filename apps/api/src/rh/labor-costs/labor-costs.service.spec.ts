import { BadRequestException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';
import { LaborCostsService } from './labor-costs.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const JOAO = '33333333-3333-3333-3333-333333333333';
const ANDRE = '44444444-4444-4444-4444-444444444444';
const TJ = '55555555-5555-5555-5555-555555555555';
const TCE = '66666666-6666-6666-6666-666666666666';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const CLT = {
  id: JOAO,
  name: 'João',
  position: 'Eletricista',
  employmentType: 'OWN',
  compensationType: 'CLT',
};
const DIARISTA = {
  id: ANDRE,
  name: 'André',
  position: 'Pedreiro',
  employmentType: 'OWN',
  compensationType: 'DAILY',
};

interface Presenca {
  employeeId: string;
  constructionSiteId: string;
  date: Date;
  dailyRateApplied: string | null;
  employee: typeof CLT;
}

/// `n` dias corridos a partir de `inicio`, todos na mesma obra.
function presencas(
  employee: typeof CLT,
  site: string,
  inicio: string,
  n: number,
  diaria: string | null = null,
): Presenca[] {
  const base = dia(inicio);
  return Array.from({ length: n }, (_, i) => {
    const data = new Date(base);
    data.setUTCDate(data.getUTCDate() + i);
    return {
      employeeId: employee.id,
      constructionSiteId: site,
      date: data,
      dailyRateApplied: diaria,
      employee,
    };
  });
}

function makeService(opcoes: {
  presencas?: Presenca[];
  holerites?: Record<string, unknown>[];
  contratos?: Record<string, unknown>[];
  alocacoes?: Record<string, unknown>[];
  siteCompanyId?: string;
} = {}) {
  const {
    presencas: linhas = [],
    holerites = [],
    contratos = [],
    alocacoes = [],
    siteCompanyId = EMPRESA,
  } = opcoes;

  const prisma = {
    employeeAttendance: {
      findMany: jest.fn(async ({ select }: { select?: Record<string, unknown> }) =>
        // A segunda chamada (dentro de `naoApontados`) só pede employeeId+date.
        select?.dailyRateApplied
          ? linhas
          : linhas.map((p) => ({ employeeId: p.employeeId, date: p.date })),
      ),
    },
    employeeAllocation: { findMany: jest.fn(async () => alocacoes) },
    payslip: { findMany: jest.fn(async () => holerites) },
    contractorContract: { findMany: jest.fn(async () => contratos) },
    constructionSite: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === siteCompanyId ? { id: TJ } : null,
      ),
    },
  } as unknown as PrismaService;

  return { service: new LaborCostsService(prisma), prisma };
}

const holerite = (employeeId: string, mes: number, extra: Record<string, unknown> = {}) => ({
  employeeId,
  referenceYear: 2026,
  referenceMonth: mes,
  grossSalary: '4000.00',
  deductions: '900.00',
  netSalary: '3100.00',
  employerCharges: '1500.00',
  benefits: '400.00',
  provisions: '100.00',
  ...extra,
});

const PERIODO = { constructionSiteId: TJ, from: '2026-09-01', to: '2026-09-30' };

/// O cenário do enunciado.
///
///     João — custo do mês R$ 6.000
///     TJ: 5 dias · TCE: 15 dias · total 20 dias
///     TJ → 25% → R$ 1.500 · TCE → 75% → R$ 4.500
describe('João entre duas obras', () => {
  const CENARIO = {
    presencas: [
      ...presencas(CLT, TJ, '2026-09-01', 5),
      ...presencas(CLT, TCE, '2026-09-06', 15),
    ],
    holerites: [holerite(JOAO, 9)],
  };

  it('a obra TJ recebe 25% do custo do mês', async () => {
    const { service } = makeService(CENARIO);

    const relatorio = await service.byConstructionSite(EMPRESA, PERIODO);
    const joao = relatorio.colaboradores[0]!;

    expect(joao.diasNaObra).toBe(5);
    expect(joao.diasPresentesNoPeriodo).toBe(20);
    expect(joao.percentual).toBe(25);
    expect(joao.custo.valor!.toFixed(2)).toBe('1500.00');
    expect(joao.custo.estado).toBe('CONHECIDO');
  });

  it('a obra TCE recebe 75%', async () => {
    const { service } = makeService(CENARIO);

    const relatorio = await service.byConstructionSite(EMPRESA, {
      ...PERIODO,
      constructionSiteId: TCE,
    });

    expect(relatorio.colaboradores[0]!.percentual).toBe(75);
    expect(relatorio.colaboradores[0]!.custo.valor!.toFixed(2)).toBe('4500.00');
  });

  it('as duas obras somadas fecham os R$ 6.000 do mês', async () => {
    const { service } = makeService(CENARIO);

    const tj = await service.byConstructionSite(EMPRESA, PERIODO);
    const tce = await service.byConstructionSite(EMPRESA, { ...PERIODO, constructionSiteId: TCE });

    const total =
      Number(tj.colaboradores[0]!.custo.valor) + Number(tce.colaboradores[0]!.custo.valor);
    expect(total.toFixed(2)).toBe('6000.00');
  });

  it('sem holerite do mês, o custo é DESCONHECIDO — nunca R$ 0', async () => {
    const { service } = makeService({ ...CENARIO, holerites: [] });

    const joao = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(joao.custo.estado).toBe('PARCIAL');
    expect(joao.custo.faltando[0]).toMatch(/sem holerite lançado/);
  });

  it('holerite só com salário deixa o custo PARCIAL', async () => {
    // Salário não é o custo do funcionário. Apresentá-lo como se fosse é
    // exatamente o erro que este módulo existe para não cometer.
    const { service } = makeService({
      ...CENARIO,
      holerites: [holerite(JOAO, 9, { employerCharges: null, benefits: null, provisions: null })],
    });

    const joao = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(joao.custo.estado).toBe('PARCIAL');
    expect(joao.custo.valor!.toFixed(2)).toBe('1000.00'); // 4000 × 25%
    expect(joao.custo.faltando).toContain('encargos patronais');
  });

  it('dias alocados sem apontamento sinalizam apropriação incompleta', async () => {
    // "Não apontado" não é ausência — e tratá-lo como tal produziria um custo
    // menor e convincente.
    //
    // A alocação na TJ vai até 25/09, mas os apontamentos do João param em
    // 20/09: os cinco últimos dias não foram olhados por ninguém.
    const { service } = makeService({
      ...CENARIO,
      alocacoes: [{ employeeId: JOAO, startDate: dia('2026-09-01'), endDate: dia('2026-09-25') }],
    });

    const joao = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(joao.custo.estado).toBe('PARCIAL');
    expect(joao.custo.faltando.some((f) => /5 dia\(s\) alocado\(s\) ainda sem apontamento/.test(f))).toBe(
      true,
    );
  });

  it('dia com presença em OUTRA obra não é "não apontado"', async () => {
    // O dia foi contabilizado — a pessoa estava na TCE. Contá-lo como pendência
    // da TJ marcaria como incompleto um relatório que está completo.
    const { service } = makeService({
      ...CENARIO,
      alocacoes: [{ employeeId: JOAO, startDate: dia('2026-09-01'), endDate: dia('2026-09-20') }],
    });

    const joao = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(joao.custo.estado).toBe('CONHECIDO');
  });
});

describe('Diarista no relatório', () => {
  it('dias presentes × diária congelada', async () => {
    const { service } = makeService({
      presencas: presencas(DIARISTA, TJ, '2026-09-08', 2, '180.00'),
    });

    const andre = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(andre.diasNaObra).toBe(2);
    expect(andre.custo.valor!.toFixed(2)).toBe('360.00');
    // Diarista não tem rateio: o custo é dele naquela obra, inteiro.
    expect(andre.percentual).toBeNull();
  });

  it('diarista NÃO consulta holerite', async () => {
    // O custo dele é a diária. Buscar holerite seria confundir os dois regimes.
    const { service } = makeService({
      presencas: presencas(DIARISTA, TJ, '2026-09-08', 2, '180.00'),
      holerites: [holerite(ANDRE, 9)],
    });

    const andre = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(andre.custo.valor!.toFixed(2)).toBe('360.00');
  });

  it('dia presente sem diária congelada deixa o custo parcial', async () => {
    const { service } = makeService({
      presencas: [
        ...presencas(DIARISTA, TJ, '2026-09-08', 1, '180.00'),
        ...presencas(DIARISTA, TJ, '2026-09-10', 1, null),
      ],
    });

    const andre = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(andre.custo.estado).toBe('PARCIAL');
    expect(andre.custo.valor!.toFixed(2)).toBe('180.00');
  });
});

/// Empreitadas entram no relatório como INFORMAÇÃO do contrato, não como custo
/// do período — enquanto não existirem medições datadas.
describe('Empreitadas sem apropriação temporal', () => {
  const ELETRICA = {
    id: 'c1',
    code: 'CT-001',
    scope: 'Instalação elétrica',
    pricingType: 'GLOBAL',
    totalValue: '10000.00',
    unitPrice: null,
    unitLabel: null,
    measuredQuantity: null,
    contractor: { legalName: 'Elétrica LTDA', tradeName: 'Elétrica' },
  };
  const ALVENARIA = {
    id: 'c2',
    code: 'CT-002',
    scope: 'Alvenaria',
    pricingType: 'UNIT',
    totalValue: '0.00',
    unitPrice: new Prisma.Decimal('30.0000'),
    unitLabel: 'm²',
    measuredQuantity: new Prisma.Decimal('200.000'),
    contractor: { legalName: 'Alvenaria ME', tradeName: null },
  };

  it('o valor contratado aparece como informação, com o rótulo certo', async () => {
    const { service } = makeService({ contratos: [ELETRICA] });

    const linha = (await service.byConstructionSite(EMPRESA, PERIODO)).empreitadas[0]!;

    expect(linha.valorInformado).toBe('10000');
    expect(linha.rotuloDoValor).toBe('Valor contratado');
  });

  it('o acumulado do contrato unitário também', async () => {
    const { service } = makeService({ contratos: [ALVENARIA] });

    const linha = (await service.byConstructionSite(EMPRESA, PERIODO)).empreitadas[0]!;

    expect(linha.valorInformado).toBe('6000');
    expect(linha.rotuloDoValor).toBe('Valor medido acumulado');
  });

  it('NENHUM dos dois entra no custo apropriado ao período', async () => {
    const { service } = makeService({ contratos: [ELETRICA, ALVENARIA] });

    const r = await service.byConstructionSite(EMPRESA, PERIODO);

    expect(r.resumo.empreitadas.valor!.toFixed(2)).toBe('0.00');
    expect(r.empreitadas.every((l) => l.custo.estado === 'DESCONHECIDO')).toBe(true);
  });

  it('o R$ 0 apropriado vem marcado como PARCIAL, não como definitivo', async () => {
    // Zero sozinho seria lido como "não houve terceirizado nesta obra".
    const { service } = makeService({ contratos: [ELETRICA] });

    const r = await service.byConstructionSite(EMPRESA, PERIODO);

    expect(r.resumo.empreitadas.estado).toBe('PARCIAL');
    expect(r.resumo.empreitadas.faltando).toContain('contrato sem apropriação temporal');
  });

  it('a parcialidade contamina o total do período', async () => {
    const { service } = makeService({
      presencas: presencas(DIARISTA, TJ, '2026-09-08', 2, '180.00'),
      contratos: [ELETRICA, ALVENARIA],
    });

    const r = await service.byConstructionSite(EMPRESA, PERIODO);

    // Só a mão de obra própria entra no total: R$ 360, e não R$ 16.360.
    expect(r.resumo.colaboradores.valor!.toFixed(2)).toBe('360.00');
    expect(r.resumo.maoDeObra.valor!.toFixed(2)).toBe('360.00');
    expect(r.resumo.maoDeObra.estado).toBe('PARCIAL');
  });

  it('o mesmo contrato consultado em dois meses não soma duas vezes', async () => {
    // Contrato de 01/09 a 31/10: setembro e outubro devolvem os dois a mesma
    // linha. Se cada consulta atribuísse R$ 10.000, o bimestre daria R$ 20.000.
    const { service } = makeService({ contratos: [ELETRICA] });

    const setembro = await service.byConstructionSite(EMPRESA, PERIODO);
    const outubro = await service.byConstructionSite(EMPRESA, {
      ...PERIODO,
      from: '2026-10-01',
      to: '2026-10-31',
    });

    const soma =
      Number(setembro.resumo.empreitadas.valor) + Number(outubro.resumo.empreitadas.valor);
    expect(soma).toBe(0);
    // E o valor contratado continua visível nas duas, como informação.
    expect(setembro.empreitadas[0]!.valorInformado).toBe('10000');
    expect(outubro.empreitadas[0]!.valorInformado).toBe('10000');
  });

  it('obra sem contrato nenhum NÃO fica parcial por causa disso', async () => {
    // A parcialidade tem de ter causa. Sem terceirizado, o zero é definitivo.
    const { service } = makeService({
      presencas: presencas(DIARISTA, TJ, '2026-09-08', 2, '180.00'),
    });

    const r = await service.byConstructionSite(EMPRESA, PERIODO);

    expect(r.resumo.empreitadas.estado).toBe('CONHECIDO');
    expect(r.resumo.maoDeObra.estado).toBe('CONHECIDO');
  });

  it('diarista e CLT seguem inalterados ao lado das empreitadas', async () => {
    // A correção é só do lado do contrato.
    const { service } = makeService({
      presencas: [
        ...presencas(CLT, TJ, '2026-09-01', 5),
        ...presencas(CLT, TCE, '2026-09-06', 15),
      ],
      holerites: [holerite(JOAO, 9)],
      contratos: [ELETRICA],
    });

    const joao = (await service.byConstructionSite(EMPRESA, PERIODO)).colaboradores[0]!;

    expect(joao.percentual).toBe(25);
    expect(joao.custo.valor!.toFixed(2)).toBe('1500.00');
    expect(joao.custo.estado).toBe('CONHECIDO');
  });
});

describe('Isolamento e validação', () => {
  it('obra de outra empresa é recusada', async () => {
    const { service } = makeService({ siteCompanyId: OUTRA_EMPRESA });

    await expect(service.byConstructionSite(EMPRESA, PERIODO)).rejects.toThrow(BadRequestException);
  });

  it('toda consulta de presença filtra pela empresa da sessão', async () => {
    const { service, prisma } = makeService({ presencas: presencas(CLT, TJ, '2026-09-01', 1) });

    await service.byConstructionSite(EMPRESA, PERIODO);

    for (const chamada of (prisma.employeeAttendance.findMany as jest.Mock).mock.calls) {
      expect(chamada[0].where.employee).toMatchObject({ companyId: EMPRESA });
    }
  });

  it('contratos são filtrados por empresa e por obra', async () => {
    const { service, prisma } = makeService();

    await service.byConstructionSite(EMPRESA, PERIODO);

    expect((prisma.contractorContract.findMany as jest.Mock).mock.calls[0]![0].where).toMatchObject({
      companyId: EMPRESA,
      constructionSiteId: TJ,
    });
  });

  it('período invertido é recusado', async () => {
    const { service } = makeService();

    await expect(
      service.byConstructionSite(EMPRESA, { ...PERIODO, from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('obra sem mão de obra no período devolve listas vazias, não erro', async () => {
    const { service } = makeService();

    const r = await service.byConstructionSite(EMPRESA, PERIODO);

    expect(r.colaboradores).toEqual([]);
    expect(r.empreitadas).toEqual([]);
    expect(r.resumo.maoDeObra.estado).toBe('CONHECIDO');
  });
});
