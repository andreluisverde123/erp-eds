import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.module';
import type { UploadPolicyService } from '../../common/uploads/upload-policy.service';
import { SiteAccessService } from '../access/site-access.service';
import {
  ALPHA,
  EMPRESA_A,
  ENGENHEIRO_A,
  ENGENHEIRO_B,
  FISCAL,
  criarAuditLoggerFalso,
  criarPrismaFalso,
  rdo,
  type LinhaRdo,
} from '../testing/diario-fixture';
import { DailyReportsService } from './daily-reports.service';
import { DailyReportItemsService } from './items/daily-report-items.service';
import { DailyReportMediaService } from './media/daily-report-media.service';

const RDO = 'rdo-alpha';

/// Relatório pronto para finalizar: jornada completa e uma atividade.
function montar(over: Partial<LinhaRdo> = {}, comAtividade = true) {
  const reports: LinhaRdo[] = [
    rdo({
      id: RDO,
      constructionSiteId: ALPHA,
      number: 24,
      workStartMinutes: 420,
      workEndMinutes: 1020,
      ...over,
    }),
  ];

  const atividades = comAtividade
    ? [
        {
          id: 'act-1',
          dailyReportId: RDO,
          description: 'Alvenaria do pavimento 03',
          location: null,
          notes: null,
          position: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
    : [];

  const { client, db } = criarPrismaFalso(reports, { activities: atividades });
  const prisma = client as unknown as PrismaService;
  const auditLogger = criarAuditLoggerFalso();
  const service = new DailyReportsService(
    prisma,
    new SiteAccessService(prisma),
    auditLogger as unknown as AuditLoggerService,
  );
  const items = new DailyReportItemsService(prisma, service);

  const storage = {
    saveUpload: jest.fn(async () => ({ key: 'diario/objeto.png', fileUrl: '/uploads/x' })),
    getStream: jest.fn(),
    exists: jest.fn(),
    remove: jest.fn(async () => undefined),
  };
  const media = new DailyReportMediaService(
    prisma,
    service,
    storage as unknown as StorageService,
    {
      assertUploadAllowed: jest.fn(async () => undefined),
      assertUploadsEnabled: jest.fn(async () => null),
    } as unknown as UploadPolicyService,
  );

  return { service, items, media, db, auditLogger, storage };
}

function png(): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(1920, 16);
  buffer.writeUInt32BE(1080, 20);
  return buffer;
}

function arquivo(): Express.Multer.File {
  const conteudo = png();
  return {
    fieldname: 'file',
    originalname: 'foto.png',
    mimetype: 'image/png',
    size: conteudo.length,
    buffer: conteudo,
  } as Express.Multer.File;
}

// ---------------------------------------------------------------------------
// A transição
// ---------------------------------------------------------------------------

describe('RDO — finalização', () => {
  it('o rascunho é editável antes de finalizar', async () => {
    const { service } = montar();

    await expect(
      service.update(EMPRESA_A, ENGENHEIRO_A, RDO, { notes: 'Tudo normal.' }),
    ).resolves.toMatchObject({ notes: 'Tudo normal.', editable: true });
  });

  it('finaliza, muda o status e carimba quando e quem', async () => {
    const { service } = montar();

    const finalizado = await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(finalizado.status).toBe('SUBMITTED');
    expect(finalizado.statusLabel).toBe('Finalizado');
    expect(finalizado.editable).toBe(false);
    expect(finalizado.submittedAt).toBeInstanceOf(Date);
    expect(finalizado.submittedBy).toMatchObject({ id: ENGENHEIRO_A });
  });

  it('não usa createdAt como data de finalização', async () => {
    // Um RDO aberto às 7h e finalizado às 17h tem dois instantes distintos.
    const { service } = montar();

    const finalizado = await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(finalizado.submittedAt!.getTime()).toBeGreaterThan(finalizado.createdAt.getTime());
  });

  it('registra a finalização na auditoria que o ERP já tem', async () => {
    const { service, auditLogger } = montar();

    await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: EMPRESA_A,
        userId: ENGENHEIRO_A,
        entityType: 'DailyReport',
        entityId: RDO,
      }),
    );
  });

  it('não altera número nem data', async () => {
    const { service } = montar();
    const antes = await service.findOne(EMPRESA_A, ENGENHEIRO_A, RDO);

    const depois = await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(depois.number).toBe(antes.number);
    expect(depois.reportDate).toEqual(antes.reportDate);
  });

  it('finalizar duas vezes falha', async () => {
    const { service } = montar();
    await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_A, RDO)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('dois usuários finalizando ao mesmo tempo: um vence, o outro recebe conflito', async () => {
    // A garantia é a cláusula do UPDATE (`WHERE status = 'DRAFT'`), não a
    // leitura anterior: ler e depois escrever deixaria uma janela em que os
    // dois passariam pela checagem.
    const { service, db } = montar();

    const resultados = await Promise.allSettled([
      service.submit(EMPRESA_A, ENGENHEIRO_A, RDO),
      service.submit(EMPRESA_A, FISCAL, RDO),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // Um único carimbo: `submittedById` não foi sobrescrito pelo segundo.
    expect(db.reports[0]!.status).toBe('SUBMITTED');
  });
});

// ---------------------------------------------------------------------------
// Pendências
// ---------------------------------------------------------------------------

describe('RDO — pendências que impedem finalizar', () => {
  it('recusa sem jornada', async () => {
    const { service } = montar({ workStartMinutes: null, workEndMinutes: null });

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_A, RDO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('recusa sem nenhuma atividade', async () => {
    const { service } = montar({}, false);

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_A, RDO)).rejects.toThrow(
      /pelo menos uma atividade/,
    );
  });

  it('o relatório continua rascunho quando a finalização é recusada', async () => {
    const { service, db } = montar({}, false);

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_A, RDO)).rejects.toThrow();

    expect(db.reports[0]!.status).toBe('DRAFT');
    expect(db.reports[0]!.submittedAt).toBeNull();
  });

  it('aceita sem clima, mão de obra, equipamentos, ocorrências, materiais nem mídia', async () => {
    const { service } = montar();

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_A, RDO)).resolves.toMatchObject({
      status: 'SUBMITTED',
    });
  });
});

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

describe('RDO — quem pode finalizar', () => {
  it('usuário sem acesso à obra não finaliza — e não descobre que o RDO existe', async () => {
    const { service, db } = montar();

    await expect(service.submit(EMPRESA_A, ENGENHEIRO_B, RDO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.reports[0]!.status).toBe('DRAFT');
  });

  it('o fiscal vinculado à obra finaliza — vínculo, não autoria', async () => {
    const { service } = montar();

    await expect(service.submit(EMPRESA_A, FISCAL, RDO)).resolves.toMatchObject({
      status: 'SUBMITTED',
    });
  });
});

// ---------------------------------------------------------------------------
// Bloqueio de escrita depois de finalizado
// ---------------------------------------------------------------------------

describe('RDO finalizado — nenhuma escrita passa', () => {
  /// Todas as escritas do relatório, para provar que UM ponto
  /// (`assertWritable`) fecha as onze de uma vez. Se alguma seção nova
  /// esquecer de passar por ele, este bloco não a cobre — mas o padrão fica
  /// registrado aqui para quem for adicioná-la.
  const escritas: [string, (c: ReturnType<typeof montar>) => Promise<unknown>][] = [
    [
      'observações (PATCH)',
      ({ service }) => service.update(EMPRESA_A, ENGENHEIRO_A, RDO, { notes: 'x' }),
    ],
    [
      'horário (PATCH)',
      ({ service }) => service.update(EMPRESA_A, ENGENHEIRO_A, RDO, { workStartTime: '08:00' }),
    ],
    [
      'clima (PATCH)',
      ({ service }) => service.update(EMPRESA_A, ENGENHEIRO_A, RDO, { morningWeather: 'SUNNY' }),
    ],
    [
      'nova mão de obra',
      ({ items }) =>
        items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO, { role: 'Pedreiro', quantity: 8 }),
    ],
    [
      'edição de mão de obra',
      ({ items }) => items.updateLabor(EMPRESA_A, ENGENHEIRO_A, RDO, 'labor-1', { quantity: 2 }),
    ],
    [
      'exclusão de mão de obra',
      ({ items }) => items.removeLabor(EMPRESA_A, ENGENHEIRO_A, RDO, 'labor-1'),
    ],
    [
      'novo equipamento',
      ({ items }) =>
        items.addEquipment(EMPRESA_A, ENGENHEIRO_A, RDO, { name: 'Betoneira', quantity: 1 }),
    ],
    [
      'nova atividade',
      ({ items }) => items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO, { description: 'Alvenaria' }),
    ],
    [
      'exclusão de atividade',
      ({ items }) => items.removeActivity(EMPRESA_A, ENGENHEIRO_A, RDO, 'act-1'),
    ],
    [
      'nova ocorrência',
      ({ items }) =>
        items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO, { type: 'OTHER', description: 'Algo' }),
    ],
    [
      'novo material',
      ({ items }) =>
        items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO, {
          name: 'Cimento',
          quantity: 10,
          unit: 'SC',
          movementType: 'RECEIVED',
        }),
    ],
    ['nova foto', ({ media }) => media.upload(EMPRESA_A, ENGENHEIRO_A, RDO, arquivo(), {})],
  ];

  it.each(escritas)('%s é recusada', async (_nome, operacao) => {
    const contexto = montar({ status: 'SUBMITTED', submittedAt: new Date() });

    await expect(operacao(contexto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('nenhum arquivo chega ao storage quando o upload é recusado', async () => {
    const contexto = montar({ status: 'SUBMITTED' });

    await expect(
      contexto.media.upload(EMPRESA_A, ENGENHEIRO_A, RDO, arquivo(), {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contexto.storage.saveUpload).not.toHaveBeenCalled();
  });

  it('a LEITURA continua funcionando — o documento não some, fica histórico', async () => {
    const { service } = montar({ status: 'SUBMITTED' });

    const relatorio = await service.findOne(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(relatorio.status).toBe('SUBMITTED');
    expect(relatorio.statusLabel).toBe('Finalizado');
    expect(relatorio.activities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Cópia
// ---------------------------------------------------------------------------

describe('RDO finalizado — cópia', () => {
  it('gera um relatório NOVO em rascunho, com número e data novos', async () => {
    const { service } = montar();
    const finalizado = await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, RDO, { reportDate: '2026-08-31' });

    expect(copia.id).not.toBe(RDO);
    expect(copia.status).toBe('DRAFT');
    expect(copia.editable).toBe(true);
    expect(copia.number).toBe(finalizado.number + 1);
    expect(copia.reportDate.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('a cópia nasce sem carimbo de finalização', async () => {
    const { service } = montar();
    await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, RDO, { reportDate: '2026-08-31' });

    expect(copia.submittedAt).toBeNull();
    expect(copia.submittedBy).toBeNull();
  });

  it('o original permanece finalizado e inalterado', async () => {
    const { service } = montar();
    const finalizado = await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    await service.copy(EMPRESA_A, ENGENHEIRO_A, RDO, { reportDate: '2026-08-31' });
    const original = await service.findOne(EMPRESA_A, ENGENHEIRO_A, RDO);

    expect(original.status).toBe('SUBMITTED');
    expect(original.number).toBe(finalizado.number);
    expect(original.submittedAt).toEqual(finalizado.submittedAt);
  });

  it('a cópia leva a jornada, e nada do que descreve o dia', async () => {
    const { service, items } = montar();
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO, { role: 'Pedreiro', quantity: 8 });
    await service.update(EMPRESA_A, ENGENHEIRO_A, RDO, { notes: 'Dia normal.' });
    await service.submit(EMPRESA_A, ENGENHEIRO_A, RDO);

    const copia = await service.copy(EMPRESA_A, ENGENHEIRO_A, RDO, { reportDate: '2026-08-31' });

    expect(copia.workSchedule).toMatchObject({ startTime: '07:00', endTime: '17:00' });
    expect(copia.summary.labor).toEqual({ roles: 1, workers: 8 });
    expect(copia.summary.activities).toBe(0);
    expect(copia.notes).toBeNull();
  });
});
