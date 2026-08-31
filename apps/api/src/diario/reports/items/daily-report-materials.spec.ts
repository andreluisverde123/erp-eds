import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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
  criarStorageMinimo,
  criarPrismaFalso,
  rdo,
  type LinhaRdo,
} from '../../testing/diario-fixture';
import type { StorageService } from '../../../storage/storage.module';
import { DailyReportsService } from '../daily-reports.service';
import { DailyReportItemsService } from './daily-report-items.service';
import { CreateMaterialDto } from './dto/material.dto';

const RDO_ALPHA = 'rdo-alpha';
const RDO_BETA = 'rdo-beta';

const CIMENTO = {
  name: 'Cimento CP-II',
  quantity: 50,
  unit: 'SC' as const,
  movementType: 'RECEIVED' as const,
};

function montar(over: Partial<LinhaRdo> = {}) {
  const reports: LinhaRdo[] = [
    rdo({ id: RDO_ALPHA, constructionSiteId: ALPHA, number: 24, ...over }),
    rdo({
      id: RDO_BETA,
      constructionSiteId: BETA,
      number: 8,
      createdById: ENGENHEIRO_B,
      reportDate: new Date('2026-08-20T00:00:00.000Z'),
    }),
  ];

  const { client, db } = criarPrismaFalso(reports);
  const prisma = client as unknown as PrismaService;
  const reportsService = new DailyReportsService(
    prisma,
    new SiteAccessService(prisma),
    criarAuditLoggerFalso() as unknown as AuditLoggerService,
    criarStorageMinimo() as unknown as StorageService,
  );
  const items = new DailyReportItemsService(prisma, reportsService);
  return { items, reports: reportsService, db };
}

/// Roda o DTO pelo mesmo pipeline de validação que o Nest aplica na requisição.
/// Testar a regra chamando o service direto pularia justamente a camada que a
/// implementa.
async function validarCriacao(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateMaterialDto, payload);
  const erros = await validate(dto);
  return erros.flatMap((erro) => Object.values(erro.constraints ?? {}));
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('RDO — materiais', () => {
  it('registra um material e o resumo passa a contá-lo', async () => {
    const { items } = montar();

    const relatorio = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    expect(relatorio.materials).toHaveLength(1);
    expect(relatorio.materials[0]).toMatchObject({
      name: 'Cimento CP-II',
      unit: 'SC',
      movementType: 'RECEIVED',
    });
    expect(relatorio.summary.materials).toBe(1);
  });

  it('aceita quantidade decimal — 2,5 m³ de concreto é uma quantidade normal', async () => {
    const { items } = montar();

    const relatorio = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      name: 'Concreto usinado',
      quantity: 2.5,
      unit: 'M3',
      movementType: 'USED',
    });

    expect(Number(relatorio.materials[0]!.quantity)).toBe(2.5);
  });

  it('edita um material', async () => {
    const { items } = montar();
    const criado = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    const relatorio = await items.updateMaterial(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.materials[0]!.id,
      { quantity: 75, movementType: 'USED', notes: 'Consumido na laje' },
    );

    expect(relatorio.materials[0]).toMatchObject({
      name: 'Cimento CP-II',
      movementType: 'USED',
      notes: 'Consumido na laje',
    });
    expect(Number(relatorio.materials[0]!.quantity)).toBe(75);
  });

  it('exclui um material', async () => {
    const { items } = montar();
    const criado = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    const relatorio = await items.removeMaterial(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.materials[0]!.id,
    );

    expect(relatorio.materials).toHaveLength(0);
    expect(relatorio.summary.materials).toBe(0);
  });

  it('permite o mesmo material duas vezes — parte recebida, parte utilizada', async () => {
    // Ao contrário da mão de obra, aqui a repetição é informação e não engano:
    // são movimentações distintas do mesmo insumo no mesmo dia.
    const { items } = montar();
    await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    const relatorio = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      ...CIMENTO,
      quantity: 20,
      movementType: 'USED',
    });

    expect(relatorio.summary.materials).toBe(2);
  });

  it('observação é opcional', async () => {
    const { items } = montar();

    const relatorio = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    expect(relatorio.materials[0]!.notes).toBeNull();
  });

  it('os materiais vêm no GET do relatório, junto do resto do conteúdo', async () => {
    const { items, reports } = montar();
    await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    const relatorio = await reports.findOne(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA);

    expect(relatorio.materials.map((linha) => linha.name)).toEqual(['Cimento CP-II']);
  });

  it('não expõe saldo, custo nem acumulado — isto não é estoque', async () => {
    const { items } = montar();

    const relatorio = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    for (const campo of ['balance', 'total', 'cost', 'price', 'supplierId', 'stock']) {
      expect(relatorio.materials[0]).not.toHaveProperty(campo);
    }
  });
});

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

describe('RDO — validação do material', () => {
  it('exige o nome', async () => {
    expect(await validarCriacao({ ...CIMENTO, name: '   ' })).toContain('Informe o material.');
  });

  it('recusa quantidade zero', async () => {
    expect(await validarCriacao({ ...CIMENTO, quantity: 0 })).toContain(
      'A quantidade deve ser maior que zero.',
    );
  });

  it('recusa quantidade negativa', async () => {
    expect(await validarCriacao({ ...CIMENTO, quantity: -5 })).toContain(
      'A quantidade deve ser maior que zero.',
    );
  });

  it('recusa quantidade que não é número', async () => {
    expect(await validarCriacao({ ...CIMENTO, quantity: Number.NaN })).not.toHaveLength(0);
    expect(await validarCriacao({ ...CIMENTO, quantity: 'cinquenta' })).not.toHaveLength(0);
  });

  it('recusa mais casas decimais do que a coluna guarda', async () => {
    // `Decimal(12,3)`: o Postgres arredondaria `0,0004` para zero, e uma
    // quantidade que vira zero depois de salva é pior que uma recusada.
    expect(await validarCriacao({ ...CIMENTO, quantity: 0.0004 })).not.toHaveLength(0);
  });

  it('recusa unidade fora do catálogo', async () => {
    expect(await validarCriacao({ ...CIMENTO, unit: 'CARROSSEL' })).toContain('Unidade inválida.');
  });

  it('recusa tipo de movimentação inválido', async () => {
    expect(await validarCriacao({ ...CIMENTO, movementType: 'VENDIDO' })).toContain(
      'Tipo de movimentação inválido.',
    );
  });

  it('aceita o material completo', async () => {
    expect(await validarCriacao({ ...CIMENTO, notes: 'Entregue pela manhã.' })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

describe('RDO — acesso aos materiais', () => {
  it('usuário sem acesso à obra não registra material', async () => {
    const { items, db } = montar();

    await expect(
      items.addMaterial(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, CIMENTO),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.materials).toHaveLength(0);
  });

  it('usuário sem acesso à obra não edita material', async () => {
    const { items } = montar();
    const criado = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    await expect(
      items.updateMaterial(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, criado.materials[0]!.id, {
        quantity: 999,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usuário sem acesso à obra não exclui material', async () => {
    const { items, db } = montar();
    const criado = await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    await expect(
      items.removeMaterial(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, criado.materials[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.materials).toHaveLength(1);
  });

  it('material de OUTRO relatório não é editável, mesmo com o id em mãos', async () => {
    const { items } = montar();
    const doBeta = await items.addMaterial(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, CIMENTO);

    await expect(
      items.updateMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.materials[0]!.id, {
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('material de OUTRO relatório não é excluível, mesmo com o id em mãos', async () => {
    const { items, db } = montar();
    const doBeta = await items.addMaterial(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, CIMENTO);

    await expect(
      items.removeMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.materials[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.materials).toHaveLength(1);
  });

  it('o fiscal vinculado à obra registra material — vínculo, não autoria', async () => {
    const { items } = montar();

    await expect(items.addMaterial(EMPRESA_A, FISCAL, RDO_ALPHA, CIMENTO)).resolves.toMatchObject({
      summary: { materials: 1 },
    });
  });

  it('relatório fechado não recebe material', async () => {
    const { items } = montar({ status: 'APPROVED' });

    await expect(
      items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ---------------------------------------------------------------------------
// Cópia
// ---------------------------------------------------------------------------

describe('RDO — materiais e cópia de relatório', () => {
  it('NÃO copia os materiais', async () => {
    // 50 sacos de cimento recebidos no dia 30 não foram recebidos de novo no
    // dia 31. Material é movimentação do dia, não arranjo da obra.
    const { items, reports } = montar();
    await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    const copia = await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      reportDate: '2026-08-31',
    });

    expect(copia.materials).toHaveLength(0);
    expect(copia.summary.materials).toBe(0);
  });

  it('a cópia não altera os materiais do original', async () => {
    const { items, reports } = montar();
    await items.addMaterial(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, CIMENTO);

    await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { reportDate: '2026-08-31' });
    const original = await reports.findOne(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA);

    expect(original.materials).toHaveLength(1);
    expect(original.materials[0]!.name).toBe('Cimento CP-II');
  });

  it('continua copiando o ARRANJO da obra — jornada, efetivo e equipamentos', async () => {
    const { items, reports } = montar();
    await reports.update(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      workStartTime: '07:00',
      workEndTime: '17:00',
    });
    await items.addLabor(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { role: 'Pedreiro', quantity: 8 });
    await items.addEquipment(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      name: 'Betoneira',
      quantity: 1,
    });

    const copia = await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      reportDate: '2026-08-31',
    });

    expect(copia.workSchedule).toMatchObject({ startTime: '07:00', endTime: '17:00' });
    expect(copia.summary.labor).toEqual({ roles: 1, workers: 8 });
    expect(copia.summary.equipment).toEqual({ items: 1, units: 1 });
  });

  it('NÃO copia mais as observações gerais', async () => {
    // Elas descrevem o dia, não o arranjo: "equipe trabalhou normalmente
    // durante a manhã", copiada e não revisada, é fato inventado sobre um dia
    // que ninguém observou.
    const { reports } = montar();
    await reports.update(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      notes: 'Equipe trabalhou normalmente durante a manhã.',
    });

    const copia = await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      reportDate: '2026-08-31',
    });

    expect(copia.notes).toBeNull();
    expect(copia.summary.hasNotes).toBe(false);
  });

  it('NÃO copia clima, atividades nem ocorrências', async () => {
    const { items, reports } = montar();
    await reports.update(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { morningWeather: 'SUNNY' });
    await items.addActivity(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { description: 'Alvenaria' });
    await items.addOccurrence(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      type: 'WEATHER',
      description: 'Chuva',
    });

    const copia = await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      reportDate: '2026-08-31',
    });

    expect(copia.morningWeather).toBeNull();
    expect(copia.summary.activities).toBe(0);
    expect(copia.summary.occurrences).toBe(0);
  });
});
