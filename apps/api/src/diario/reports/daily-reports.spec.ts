import { ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { SiteAccessService } from '../access/site-access.service';
import { DailyReportsService } from './daily-reports.service';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';

import {
  ALPHA,
  BETA,
  EMPRESA_A,
  ENGENHEIRO_A,
  ENGENHEIRO_B,
  FISCAL,
  OBRA_OUTRA_EMPRESA,
  criarAuditLoggerFalso,
  criarPrismaFalso,
  rdo,
  type BancoFalso,
  type LinhaRdo,
} from '../testing/diario-fixture';

const HOJE = '2026-08-30';
const ONTEM = '2026-08-29';

function montar(inicial: LinhaRdo[] = [], filhos: Partial<BancoFalso> = {}) {
  const { client, db, controle } = criarPrismaFalso(inicial, filhos);
  const prisma = client as unknown as PrismaService;
  const auditLogger = criarAuditLoggerFalso();
  const service = new DailyReportsService(
    prisma,
    new SiteAccessService(prisma),
    auditLogger as unknown as AuditLoggerService,
  );
  return { service, db, rdos: db.reports, controle };
}

const rdoExistente = rdo;

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

describe('RDO — criação', () => {
  it('usuário autorizado cria o relatório e ele nasce em RASCUNHO', async () => {
    const { service } = montar();

    const rdo = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: HOJE,
    });

    expect(rdo.status).toBe('DRAFT');
    expect(rdo.statusLabel).toBe('Rascunho');
    expect(rdo.editable).toBe(true);
    expect(rdo.id).toBeTruthy();
  });

  it('o cabeçalho vem pronto do backend — dia da semana e prazo incluídos', async () => {
    const { service } = montar();

    const rdo = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: HOJE,
    });

    expect(rdo.weekday).toBe('Domingo');
    expect(rdo.constructionSite.name).toBe('Residencial Aurora');
    expect(rdo.schedule.elapsedDays).toBe(241);
    expect(rdo.schedule.remainingDays).toBe(123);
  });

  it('usuário sem acesso à obra não consegue criar', async () => {
    const { service, rdos } = montar();

    await expect(
      service.create(EMPRESA_A, ENGENHEIRO_B, { constructionSiteId: ALPHA, reportDate: HOJE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rdos).toHaveLength(0);
  });

  it('obra de outra empresa é recusada mesmo com o UUID correto', async () => {
    const { service } = montar();

    await expect(
      service.create(EMPRESA_A, ENGENHEIRO_A, {
        constructionSiteId: OBRA_OUTRA_EMPRESA,
        reportDate: HOJE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o número é sequencial dentro da obra', async () => {
    const { service } = montar();

    const primeiro = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: '2026-08-28',
    });
    const segundo = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: ONTEM,
    });

    expect(primeiro.number).toBe(1);
    expect(segundo.number).toBe(2);
  });

  it('a numeração recomeça em cada obra — não há contador global', async () => {
    const { service } = montar();

    const alpha = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: HOJE,
    });
    const beta = await service.create(EMPRESA_A, ENGENHEIRO_B, {
      constructionSiteId: BETA,
      reportDate: HOJE,
    });

    expect(alpha.number).toBe(1);
    expect(beta.number).toBe(1);
  });

  it('não reaproveita número de relatório excluído', async () => {
    // Um RDO #24 excluído não devolve o 24 para o próximo: a numeração de um
    // documento de obra precisa ser estável para quem a citou em ata.
    const { service } = montar([
      rdoExistente({ id: 'excluido', number: 24, deletedAt: new Date() }),
    ]);

    const novo = await service.create(EMPRESA_A, ENGENHEIRO_A, {
      constructionSiteId: ALPHA,
      reportDate: HOJE,
    });

    expect(novo.number).toBe(25);
  });

  it('recusa um segundo relatório da mesma obra na mesma data', async () => {
    const { service } = montar([rdoExistente({ reportDate: new Date(`${HOJE}T00:00:00.000Z`) })]);

    await expect(
      service.create(EMPRESA_A, ENGENHEIRO_A, { constructionSiteId: ALPHA, reportDate: HOJE }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a mesma data em obras diferentes é permitida', async () => {
    const { service } = montar([rdoExistente({ reportDate: new Date(`${HOJE}T00:00:00.000Z`) })]);

    await expect(
      service.create(EMPRESA_A, ENGENHEIRO_B, { constructionSiteId: BETA, reportDate: HOJE }),
    ).resolves.toMatchObject({ number: 1 });
  });
});

// ---------------------------------------------------------------------------
// Concorrência
// ---------------------------------------------------------------------------

describe('RDO — concorrência na numeração', () => {
  it('dois usuários criando na MESMA obra ao mesmo tempo recebem números diferentes', async () => {
    const { service, controle } = montar([rdoExistente({ number: 23 })]);

    const [doFiscal, doEngenheiro] = await Promise.all([
      service.create(EMPRESA_A, FISCAL, { constructionSiteId: ALPHA, reportDate: HOJE }),
      service.create(EMPRESA_A, ENGENHEIRO_A, {
        constructionSiteId: ALPHA,
        reportDate: '2026-08-28',
      }),
    ]);

    expect(controle.locksPedidos).toBe(2);
    expect([doFiscal.number, doEngenheiro.number].sort()).toEqual([24, 25]);
  });

  it('SEM o lock a corrida acontece — é ele que a fecha, não o acaso', async () => {
    // Este é o par de controle do teste acima. Sem ele, a proteção poderia ser
    // removida do código e a suíte continuaria verde: os dois `create` talvez
    // nunca se cruzassem por sorte de agendamento.
    const { service, controle } = montar([rdoExistente({ number: 23 })]);
    controle.lockLigado = false;

    const resultado = await Promise.allSettled([
      service.create(EMPRESA_A, FISCAL, { constructionSiteId: ALPHA, reportDate: HOJE }),
      service.create(EMPRESA_A, ENGENHEIRO_A, {
        constructionSiteId: ALPHA,
        reportDate: '2026-08-28',
      }),
    ]);

    // As duas leem MAX(number)=23 e tentam gravar o 24. O índice único recusa a
    // segunda: nenhum relatório duplicado chega ao banco, nem sob falha do lock.
    expect(resultado.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('obras diferentes não esperam uma pela outra — o lock é por obra', async () => {
    const { service } = montar();

    const [alpha, beta] = await Promise.all([
      service.create(EMPRESA_A, ENGENHEIRO_A, { constructionSiteId: ALPHA, reportDate: HOJE }),
      service.create(EMPRESA_A, ENGENHEIRO_B, { constructionSiteId: BETA, reportDate: HOJE }),
    ]);

    expect(alpha.number).toBe(1);
    expect(beta.number).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

describe('RDO — consulta e isolamento', () => {
  const base = [
    rdoExistente({ id: 'alpha-23', constructionSiteId: ALPHA, number: 23 }),
    rdoExistente({
      id: 'beta-8',
      constructionSiteId: BETA,
      number: 8,
      createdById: ENGENHEIRO_B,
      reportDate: new Date('2026-08-27T00:00:00.000Z'),
    }),
  ];

  it('o engenheiro vê os RDOs das obras dele, e só deles', async () => {
    const { service } = montar(base);

    const { data } = await service.findAll(EMPRESA_A, ENGENHEIRO_A, { page: 1, limit: 10 });

    expect(data.map((r) => r.id)).toEqual(['alpha-23']);
  });

  it('o fiscal vê os RDOs da obra atribuída a ele, inclusive os que não escreveu', async () => {
    const { service } = montar(base);

    const { data } = await service.findAll(EMPRESA_A, FISCAL, { page: 1, limit: 10 });

    expect(data.map((r) => r.id)).toEqual(['alpha-23']);
  });

  it('a negativa de RDO alheio é INDISTINGUÍVEL da de RDO inexistente', async () => {
    // Não basta os dois serem 404: a MENSAGEM também precisa ser a mesma.
    // Enquanto o relatório alheio respondia "Obra não encontrada ou não
    // vinculada ao seu acesso", o texto virava um oráculo — com um token
    // válido, alguém enumerava quais ids de RDO existem na empresa sem
    // conseguir abrir nenhum. Encontrado exercitando a API de verdade; o teste
    // anterior conferia só o tipo da exceção.
    const { service } = montar(base);

    const alheio = await service
      .findOne(EMPRESA_A, ENGENHEIRO_A, 'beta-8')
      .catch((erro: Error) => erro.message);
    const inexistente = await service
      .findOne(EMPRESA_A, ENGENHEIRO_A, 'cccccccc-0000-4000-8000-000000009999')
      .catch((erro: Error) => erro.message);

    expect(alheio).toBe(inexistente);
  });

  it('abrir por ID um RDO de outra obra é bloqueado', async () => {
    const { service } = montar(base);

    await expect(service.findOne(EMPRESA_A, ENGENHEIRO_A, 'beta-8')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('o usuário abre o próprio RDO normalmente', async () => {
    const { service } = montar(base);

    await expect(service.findOne(EMPRESA_A, ENGENHEIRO_A, 'alpha-23')).resolves.toMatchObject({
      id: 'alpha-23',
      number: 23,
      weekday: 'Sábado',
    });
  });

  it('filtra por período pela data do relatório', async () => {
    const { service } = montar([
      rdoExistente({ id: 'a', number: 1, reportDate: new Date('2026-08-01T00:00:00.000Z') }),
      rdoExistente({ id: 'b', number: 2, reportDate: new Date('2026-08-20T00:00:00.000Z') }),
      rdoExistente({ id: 'c', number: 3, reportDate: new Date('2026-08-30T00:00:00.000Z') }),
    ]);

    const { data } = await service.findAll(EMPRESA_A, ENGENHEIRO_A, {
      page: 1,
      limit: 10,
      dateFrom: '2026-08-15',
      dateTo: '2026-08-25',
    });

    expect(data.map((r) => r.id)).toEqual(['b']);
  });

  it('filtra por situação', async () => {
    const { service } = montar([
      rdoExistente({ id: 'rascunho', number: 1, status: 'DRAFT' }),
      rdoExistente({
        id: 'finalizado',
        number: 2,
        status: 'APPROVED',
        reportDate: new Date('2026-08-20T00:00:00.000Z'),
      }),
    ]);

    const { data } = await service.findAll(EMPRESA_A, ENGENHEIRO_A, {
      page: 1,
      limit: 10,
      status: 'APPROVED',
    });

    expect(data.map((r) => r.id)).toEqual(['finalizado']);
  });
});

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

describe('RDO — edição', () => {
  it('usuário autorizado edita o rascunho', async () => {
    const { service } = montar([rdoExistente()]);

    const salvo = await service.update(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      notes: 'Chuva no período da tarde.',
    });

    expect(salvo.notes).toBe('Chuva no período da tarde.');
  });

  it('usuário sem acesso à obra não edita', async () => {
    const { service, rdos } = montar([rdoExistente()]);

    await expect(
      service.update(EMPRESA_A, ENGENHEIRO_B, 'rdo-existente', { notes: 'invasão' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rdos[0]!.notes).toBe('Concretagem do 3º pavimento.');
  });

  it('relatório finalizado não é editável pelo fluxo comum', async () => {
    const { service } = montar([rdoExistente({ status: 'APPROVED' })]);

    await expect(
      service.update(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', { notes: 'depois do fecho' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('relatório em revisão também não é editável', async () => {
    const { service } = montar([rdoExistente({ status: 'SUBMITTED' })]);

    await expect(
      service.update(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PATCH sem nenhum campo é aceito — o autosave pode disparar sem novidade', async () => {
    const { service } = montar([rdoExistente()]);

    await expect(
      service.update(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {}),
    ).resolves.toMatchObject({ id: 'rdo-existente' });
  });

  it('a data do relatório NÃO é editável — um RDO é um dia específico', async () => {
    // Mudar a data transformaria o documento em outro documento, com o mesmo
    // número, que é sequencial por obra e foi emitido para aquela data. O
    // campo não existe no DTO; este teste guarda a ausência, que é fácil de
    // reintroduzir sem querer.
    const { service } = montar([rdoExistente()]);
    const antes = await service.findOne(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    await service.update(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      notes: 'Qualquer coisa.',
      // @ts-expect-error — `reportDate` não faz parte de `UpdateDailyReportDto`.
      reportDate: HOJE,
    });

    const depois = await service.findOne(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');
    expect(depois.reportDate).toEqual(antes.reportDate);
  });
});

// ---------------------------------------------------------------------------
// Cópia
// ---------------------------------------------------------------------------

describe('RDO — cópia', () => {
  it('copia um relatório da mesma obra, com número e data novos', async () => {
    const { service } = montar([rdoExistente()]);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      reportDate: HOJE,
    });

    expect(copia.id).not.toBe('rdo-existente');
    expect(copia.number).toBe(24);
    expect(copia.reportDate.toISOString()).toBe(`${HOJE}T00:00:00.000Z`);
    expect(copia.status).toBe('DRAFT');
  });

  it('a cópia leva a jornada e registra a procedência', async () => {
    const { service } = montar([
      rdoExistente({ workStartMinutes: 420, workEndMinutes: 1020, scheduleNotes: 'Turno normal.' }),
    ]);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      reportDate: HOJE,
    });

    expect(copia.workSchedule).toMatchObject({ startTime: '07:00', endTime: '17:00' });
    expect(copia.scheduleNotes).toBe('Turno normal.');
    expect(copia.copiedFrom).toMatchObject({ id: 'rdo-existente', number: 23 });
  });

  it('a cópia NÃO leva as observações gerais — elas descrevem o dia', async () => {
    const { service } = montar([rdoExistente()]);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      reportDate: HOJE,
    });

    expect(copia.notes).toBeNull();
  });

  it('o relatório de origem permanece intacto', async () => {
    const { service, rdos } = montar([rdoExistente()]);
    const antes = { ...rdos[0]! };

    await service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', { reportDate: HOJE });

    expect(rdos.find((r) => r.id === 'rdo-existente')).toMatchObject({
      number: antes.number,
      notes: antes.notes,
      status: antes.status,
      reportDate: antes.reportDate,
    });
  });

  it('a cópia fica na obra da ORIGEM — não há entrada para uma obra de destino', async () => {
    const { service } = montar([rdoExistente()]);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', {
      reportDate: HOJE,
    });

    expect(copia.constructionSite.id).toBe(ALPHA);
  });

  it('não copia relatório de obra a que o usuário não tem acesso', async () => {
    const { service, rdos } = montar([rdoExistente({ id: 'beta-8', constructionSiteId: BETA })]);

    await expect(
      service.copy(EMPRESA_A, ENGENHEIRO_A, 'beta-8', { reportDate: HOJE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rdos).toHaveLength(1);
  });

  it('copiar para uma data que já tem relatório é recusado', async () => {
    const { service } = montar([
      rdoExistente({ id: 'a', number: 1, reportDate: new Date(`${ONTEM}T00:00:00.000Z`) }),
      rdoExistente({ id: 'b', number: 2, reportDate: new Date(`${HOJE}T00:00:00.000Z`) }),
    ]);

    await expect(
      service.copy(EMPRESA_A, ENGENHEIRO_A, 'a', { reportDate: HOJE }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('copiar um relatório finalizado é permitido — o que não se edita é o original', async () => {
    const { service } = montar([rdoExistente({ status: 'APPROVED' })]);

    await expect(
      service.copy(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente', { reportDate: HOJE }),
    ).resolves.toMatchObject({ status: 'DRAFT', number: 24 });
  });
});
