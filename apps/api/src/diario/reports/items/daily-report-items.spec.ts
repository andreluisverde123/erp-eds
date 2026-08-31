import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../prisma/prisma.service';
import { SiteAccessService } from '../../access/site-access.service';
import type { AuditLoggerService } from '../../../common/services/audit-logger.service';

import {
  ALPHA,
  BETA,
  EMPRESA_A,
  ENGENHEIRO_A,
  ENGENHEIRO_B,
  FISCAL,
  criarAuditLoggerFalso,
  criarPrismaFalso,
  rdo,
  type BancoFalso,
  type LinhaRdo,
} from '../../testing/diario-fixture';
import { DailyReportsService } from '../daily-reports.service';
import { DailyReportItemsService } from './daily-report-items.service';

const RDO_ALPHA = 'rdo-alpha';
const RDO_BETA = 'rdo-beta';

function montar(reports: LinhaRdo[] = [], filhos: Partial<BancoFalso> = {}) {
  const { client, db } = criarPrismaFalso(reports, filhos);
  const prisma = client as unknown as PrismaService;
  const reportsService = new DailyReportsService(
    prisma,
    new SiteAccessService(prisma),
    criarAuditLoggerFalso() as unknown as AuditLoggerService,
  );
  const items = new DailyReportItemsService(prisma, reportsService);
  return { items, reports: reportsService, db };
}

/// Um RDO em cada obra. O da Beta existe para todo teste de isolamento ter um
/// alvo real: negar acesso a um id inexistente não prova nada.
function comDoisRelatorios(over: Partial<LinhaRdo> = {}) {
  return [
    rdo({ id: RDO_ALPHA, constructionSiteId: ALPHA, number: 24, ...over }),
    rdo({
      id: RDO_BETA,
      constructionSiteId: BETA,
      number: 8,
      createdById: ENGENHEIRO_B,
      reportDate: new Date('2026-08-20T00:00:00.000Z'),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Mão de obra
// ---------------------------------------------------------------------------

describe('RDO — mão de obra', () => {
  it('adiciona uma função e devolve o relatório com o resumo recalculado', async () => {
    const { items } = montar(comDoisRelatorios());

    const relatorio = await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      role: 'Pedreiro',
      quantity: 8,
    });

    expect(relatorio.labor).toHaveLength(1);
    expect(relatorio.summary.labor).toEqual({ roles: 1, workers: 8 });
  });

  it('calcula o total somando as funções — nunca vem do cliente', async () => {
    const { items } = montar(comDoisRelatorios());

    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Pedreiro', quantity: 8 });
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Servente', quantity: 6 });
    const relatorio = await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      role: 'Eletricista',
      quantity: 2,
    });

    expect(relatorio.summary.labor).toEqual({ roles: 3, workers: 16 });
  });

  it('edita a quantidade de uma função', async () => {
    const { items } = montar(comDoisRelatorios());
    const criado = await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      role: 'Pedreiro',
      quantity: 8,
    });

    const relatorio = await items.updateLabor(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.labor[0]!.id,
      { quantity: 11 },
    );

    expect(relatorio.labor[0]!.quantity).toBe(11);
    expect(relatorio.summary.labor.workers).toBe(11);
  });

  it('exclui uma função e o total acompanha', async () => {
    const { items } = montar(comDoisRelatorios());
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Servente', quantity: 6 });
    const criado = await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      role: 'Pedreiro',
      quantity: 8,
    });
    const pedreiro = criado.labor.find((linha) => linha.role === 'Pedreiro')!;

    const relatorio = await items.removeLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, pedreiro.id);

    expect(relatorio.labor.map((linha) => linha.role)).toEqual(['Servente']);
    expect(relatorio.summary.labor).toEqual({ roles: 1, workers: 6 });
  });

  it('recusa a mesma função duas vezes — seriam 8 e 3 em vez de 11', async () => {
    const { items } = montar(comDoisRelatorios());
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Pedreiro', quantity: 8 });

    await expect(
      items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Pedreiro', quantity: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a mesma função em relatórios diferentes é permitida', async () => {
    // A constraint é por relatório, não global: "Pedreiro" na Aurora e
    // "Pedreiro" na Central são registros independentes.
    const { items } = montar(comDoisRelatorios());
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Pedreiro', quantity: 8 });

    const doBeta = await items.addLabor(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, {
      role: 'Pedreiro',
      quantity: 4,
    });

    expect(doBeta.summary.labor).toEqual({ roles: 1, workers: 4 });
  });

  it('item de outro relatório não é editável nem pelo id', async () => {
    const { items } = montar(comDoisRelatorios());
    const doBeta = await items.addLabor(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, {
      role: 'Pedreiro',
      quantity: 4,
    });

    await expect(
      items.updateLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.labor[0]!.id, { quantity: 99 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Equipamentos
// ---------------------------------------------------------------------------

describe('RDO — equipamentos', () => {
  it('adiciona, edita e exclui', async () => {
    const { items } = montar(comDoisRelatorios());

    const criado = await items.addEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      name: 'Betoneira',
      quantity: 1,
    });
    expect(criado.summary.equipment).toEqual({ items: 1, units: 1 });

    const id = criado.equipment[0]!.id;
    const editado = await items.updateEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, id, {
      quantity: 2,
      notes: 'Uma em manutenção',
    });
    expect(editado.equipment[0]).toMatchObject({ quantity: 2, notes: 'Uma em manutenção' });

    const removido = await items.removeEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, id);
    expect(removido.equipment).toHaveLength(0);
  });

  it('permite o mesmo equipamento duas vezes — um operando, outro parado', async () => {
    // Ao contrário da mão de obra: aqui a repetição é informação, não engano.
    const { items } = montar(comDoisRelatorios());
    await items.addEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      name: 'Betoneira',
      quantity: 1,
      notes: 'Operando',
    });

    const relatorio = await items.addEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      name: 'Betoneira',
      quantity: 1,
      notes: 'Em manutenção',
    });

    expect(relatorio.summary.equipment).toEqual({ items: 2, units: 2 });
  });
});

// ---------------------------------------------------------------------------
// Atividades
// ---------------------------------------------------------------------------

describe('RDO — atividades', () => {
  it('adiciona atividades em ordem, com a posição atribuída pelo servidor', async () => {
    const { items } = montar(comDoisRelatorios());

    await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      description: 'Alvenaria do pavimento 03',
      location: 'Pavimento 03',
    });
    const relatorio = await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      description: 'Instalação da rede hidráulica',
    });

    expect(relatorio.activities.map((linha) => linha.position)).toEqual([1, 2]);
    expect(relatorio.activities[0]!.location).toBe('Pavimento 03');
    expect(relatorio.summary.activities).toBe(2);
  });

  it('edita a descrição sem mexer no resto', async () => {
    const { items } = montar(comDoisRelatorios());
    const criado = await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      description: 'Alvenaria',
      location: 'Pavimento 03',
    });

    const relatorio = await items.updateActivity(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.activities[0]!.id,
      { description: 'Alvenaria e chapisco' },
    );

    expect(relatorio.activities[0]).toMatchObject({
      description: 'Alvenaria e chapisco',
      location: 'Pavimento 03',
    });
  });

  it('exclui uma atividade sem embaralhar as outras', async () => {
    const { items } = montar(comDoisRelatorios());
    await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { description: 'Primeira' });
    const segunda = await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      description: 'Segunda',
    });
    await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { description: 'Terceira' });

    const relatorio = await items.removeActivity(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      segunda.activities[1]!.id,
    );

    expect(relatorio.activities.map((linha) => linha.description)).toEqual([
      'Primeira',
      'Terceira',
    ]);
  });

  it('PATCH sem nenhum campo não é 404 — o item existe e não havia o que mudar', async () => {
    const { items } = montar(comDoisRelatorios());
    const criado = await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      description: 'Alvenaria',
    });

    await expect(
      items.updateActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.activities[0]!.id, {}),
    ).resolves.toMatchObject({ summary: { activities: 1 } });
  });

  it('excluir item inexistente é 404', async () => {
    const { items } = montar(comDoisRelatorios());

    await expect(
      items.removeActivity(
        EMPRESA_A,
        ENGENHEIRO_A,
        RDO_ALPHA,
        'cccccccc-0000-4000-8000-000000009999',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------

describe('RDO — ocorrências', () => {
  it('registra uma ocorrência com tipo e horário', async () => {
    const { items } = montar(comDoisRelatorios());

    const relatorio = await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'WEATHER',
      description: 'Chuva forte',
      occurredAtTime: '14:30',
    });

    expect(relatorio.occurrences[0]).toMatchObject({
      type: 'WEATHER',
      description: 'Chuva forte',
      occurredAtMinutes: 870,
    });
  });

  it('aceita ocorrência SEM horário', async () => {
    // "Chuva intensa durante a tarde" é registro legítimo e não tem hora.
    // Exigi-la faria o usuário inventar uma.
    const { items } = montar(comDoisRelatorios());

    const relatorio = await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'WEATHER',
      description: 'Chuva intensa durante a tarde',
    });

    expect(relatorio.occurrences[0]!.occurredAtMinutes).toBeNull();
  });

  it('ordena por horário, com as sem horário no fim', async () => {
    const { items } = montar(comDoisRelatorios());
    await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'OTHER',
      description: 'Sem hora',
    });
    await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'SAFETY',
      description: 'Tarde',
      occurredAtTime: '15:00',
    });
    const relatorio = await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'MATERIAL',
      description: 'Manhã',
      occurredAtTime: '09:00',
    });

    expect(relatorio.occurrences.map((linha) => linha.description)).toEqual([
      'Manhã',
      'Tarde',
      'Sem hora',
    ]);
  });

  it('limpa o horário quando ele vem nulo', async () => {
    const { items } = montar(comDoisRelatorios());
    const criado = await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'MATERIAL',
      description: 'Atraso na entrega',
      occurredAtTime: '09:00',
    });

    const relatorio = await items.updateOccurrence(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.occurrences[0]!.id,
      { occurredAtTime: null },
    );

    expect(relatorio.occurrences[0]!.occurredAtMinutes).toBeNull();
  });

  it('recusa horário fora do relógio', async () => {
    const { items } = montar(comDoisRelatorios());

    await expect(
      items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
        type: 'OTHER',
        description: 'Qualquer',
        occurredAtTime: '25:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('edita e exclui', async () => {
    const { items } = montar(comDoisRelatorios());
    const criado = await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'OTHER',
      description: 'Visita',
    });
    const id = criado.occurrences[0]!.id;

    const editado = await items.updateOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, id, {
      type: 'INSPECTION',
      description: 'Visita da fiscalização',
    });
    expect(editado.occurrences[0]).toMatchObject({
      type: 'INSPECTION',
      description: 'Visita da fiscalização',
    });

    const removido = await items.removeOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, id);
    expect(removido.summary.occurrences).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Acesso — a metade da cadeia que não pode ser esquecida em nenhuma seção
// ---------------------------------------------------------------------------

describe('RDO — acesso ao conteúdo', () => {
  const operacoes: [
    string,
    (s: DailyReportItemsService, u: string, r: string) => Promise<unknown>,
  ][] = [
    ['mão de obra', (s, u, r) => s.addLabor(EMPRESA_A, u, r, { role: 'Pedreiro', quantity: 1 })],
    [
      'equipamento',
      (s, u, r) => s.addEquipment(EMPRESA_A, u, r, { name: 'Betoneira', quantity: 1 }),
    ],
    ['atividade', (s, u, r) => s.addActivity(EMPRESA_A, u, r, { description: 'Alvenaria' })],
    [
      'ocorrência',
      (s, u, r) => s.addOccurrence(EMPRESA_A, u, r, { type: 'OTHER', description: 'Algo' }),
    ],
  ];

  it.each(operacoes)('o engenheiro da Alpha não adiciona %s no RDO da Beta', async (_nome, op) => {
    const { items, db } = montar(comDoisRelatorios());

    await expect(op(items, ENGENHEIRO_A, RDO_BETA)).rejects.toBeInstanceOf(NotFoundException);
    expect([...db.labor, ...db.equipment, ...db.activities, ...db.occurrences]).toHaveLength(0);
  });

  it.each(operacoes)('o engenheiro da Beta não adiciona %s no RDO da Alpha', async (_nome, op) => {
    const { items } = montar(comDoisRelatorios());

    await expect(op(items, ENGENHEIRO_B, RDO_ALPHA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o fiscal da Alpha registra no RDO da Alpha — vínculo, não autoria', async () => {
    const { items } = montar(comDoisRelatorios());

    await expect(
      items.addOccurrence(EMPRESA_A, FISCAL, RDO_ALPHA, {
        type: 'INSPECTION',
        description: 'Vistoria da laje',
      }),
    ).resolves.toMatchObject({ summary: { occurrences: 1 } });
  });

  it.each(operacoes)('relatório fechado não recebe %s', async (_nome, op) => {
    const { items } = montar(comDoisRelatorios({ status: 'APPROVED' }));

    await expect(op(items, ENGENHEIRO_A, RDO_ALPHA)).rejects.toBeInstanceOf(ConflictException);
  });
});
