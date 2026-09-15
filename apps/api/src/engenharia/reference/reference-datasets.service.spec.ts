import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { hashDosArquivos, lotes, ReferenceDatasetsService } from './reference-datasets.service';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '33333333-3333-4333-8333-333333333333';
const PASTA = join(__dirname, 'parsing', '__fixtures__');

const SINAPI = [
  { originalname: 'SINAPI_Referência_2026_08.xlsx', buffer: readFileSync(join(PASTA, 'SINAPI_Referência_2026_08-amostra.xlsx')) },
];
const SICRO = readdirSync(PASTA)
  .filter((nome) => nome.startsWith('SP 04-2026'))
  .map((originalname) => ({ originalname, buffer: readFileSync(join(PASTA, originalname)) }));

type Linha = Record<string, unknown> & { id?: string; code?: string; structureHash?: string };

/// Dublê COM ESTADO das tabelas de edição, estrutura e preço: o que uma
/// importação grava, a próxima (outra UF) enxerga — é o que prova que a
/// estrutura é gravada uma vez só.
function makeService(opcoes: { duplicado?: boolean; falhar?: 'precos' | 'unique' | 'unique-estrutura' } = {}) {
  const banco = {
    edicoes: [] as Linha[],
    datasets: [] as Linha[],
    insumos: [] as Linha[],
    composicoes: [] as Linha[],
    linhas: [] as Linha[],
    precosDeInsumo: [] as Linha[],
    precosDeComposicao: [] as Linha[],
  };

  const inserirSemDuplicar = (tabela: Linha[], dados: Linha[], chave: (l: Linha) => string) => {
    const existentes = new Set(tabela.map(chave));
    let count = 0;
    for (const linha of dados) {
      if (existentes.has(chave(linha))) continue;
      tabela.push(linha);
      existentes.add(chave(linha));
      count += 1;
    }
    return { count };
  };
  const estrutura = (l: Linha) => `${l.editionId}|${l.code}|${l.structureHash}`;
  const porCodigos = (tabela: Linha[]) =>
    jest.fn(async ({ where }: { where: { editionId: string; code: { in: string[] } } }) =>
      tabela.filter((l) => l.editionId === where.editionId && where.code.in.includes(l.code as string)),
    );

  const tx = {
    referenceEdition: {
      upsert: jest.fn(async ({ where, create }: { where: { source_competence_versionLabel: Linha }; create: Linha }) => {
        const k = where.source_competence_versionLabel;
        let edicao = banco.edicoes.find((e) => e.source === k.source && e.competence === k.competence && e.versionLabel === k.versionLabel);
        if (!edicao) {
          edicao = { id: `edicao-${banco.edicoes.length + 1}`, ...create };
          banco.edicoes.push(edicao);
        }
        return { id: edicao.id };
      }),
    },
    referenceItem: {
      createMany: jest.fn(async ({ data }: { data: Linha[] }) => {
        if (opcoes.falhar === 'unique-estrutura') {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7', meta: { target: ['editionId', 'code', 'structureHash'] } });
        }
        return inserirSemDuplicar(banco.insumos, data, estrutura);
      }),
      findMany: porCodigos(banco.insumos),
    },
    referenceComposition: {
      createMany: jest.fn(async ({ data }: { data: Linha[] }) => inserirSemDuplicar(banco.composicoes, data, estrutura)),
      findMany: porCodigos(banco.composicoes),
    },
    referenceCompositionItem: {
      createMany: jest.fn(async ({ data }: { data: Linha[] }) => {
        banco.linhas.push(...data);
        return { count: data.length };
      }),
    },
    referenceDataset: {
      create: jest.fn(async ({ data }: { data: Linha }) => {
        if (opcoes.falhar === 'unique') {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '7',
            meta: { target: ['source', 'competence', 'uf', 'regime', 'versionLabel'] },
          });
        }
        banco.datasets.push(data);
        return data;
      }),
    },
    referenceItemPrice: {
      createMany: jest.fn(async ({ data }: { data: Linha[] }) => {
        banco.precosDeInsumo.push(...data);
        return { count: data.length };
      }),
    },
    referenceCompositionPrice: {
      createMany: jest.fn(async ({ data }: { data: Linha[] }) => {
        if (opcoes.falhar === 'precos') throw new Error('conexão caiu');
        banco.precosDeComposicao.push(...data);
        return { count: data.length };
      }),
    },
  };

  const prisma = {
    ...tx,
    referenceDataset: {
      ...tx.referenceDataset,
      findUnique: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id) {
          const ds = banco.datasets.find((d) => d.id === where.id) ?? { id: where.id };
          return {
            source: 'SINAPI',
            competence: '2026-08',
            referenceDate: new Date('2026-08-01T00:00:00Z'),
            uf: 'SP',
            locality: 'SAO PAULO',
            regime: 'NAO_DESONERADO',
            versionLabel: '',
            publishedAt: null,
            fileNames: [],
            itemCount: 21,
            compositionCount: 16,
            metadata: {},
            importedAt: new Date(),
            ...ds,
          };
        }
        return opcoes.duplicado ? { id: 'existente', importedAt: new Date() } : null;
      }),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    referenceItemPrice: { ...tx.referenceItemPrice, findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: unknown) => Promise<unknown>)(tx) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const auditLogger = { log: jest.fn(async () => undefined) };
  const service = new ReferenceDatasetsService(
    prisma as unknown as PrismaService,
    auditLogger as unknown as AuditLoggerService,
  );
  return { service, prisma, tx, auditLogger, banco };
}

describe('Bases referenciais — prévia', () => {
  it('SINAPI: mostra fonte, competência, UF, regime e contagens, sem gravar nada', async () => {
    const { service, tx } = makeService();
    const previa = await service.preview({ source: 'SINAPI', uf: 'SP', regime: 'NAO_DESONERADO' }, SINAPI);
    expect(previa).toMatchObject({
      source: 'SINAPI',
      competence: '2026-08',
      referenceDate: '2026-08-01',
      uf: 'SP',
      locality: 'SAO PAULO',
      regime: 'NAO_DESONERADO',
      itemCount: 21,
      compositionCount: 16,
      componentCount: 58,
      compositionsWithoutCost: 1,
      errorCount: 0,
      duplicate: null,
      canImport: true,
    });
    expect(previa.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(previa.warningCount).toBeGreaterThan(0);
    expect(tx.referenceDataset.create).not.toHaveBeenCalled();
    expect(tx.referenceItem.createMany).not.toHaveBeenCalled();
  });

  it('SICRO: UF e competência vêm do relatório', async () => {
    const { service } = makeService();
    const previa = await service.preview({ source: 'SICRO' }, SICRO);
    expect(previa).toMatchObject({ source: 'SICRO', competence: '2026-04', uf: 'SP', compositionCount: 3, canImport: true });
  });

  it('duplicidade aparece na prévia e impede a importação', async () => {
    const { service } = makeService({ duplicado: true });
    const previa = await service.preview({ source: 'SINAPI', uf: 'SP', regime: 'NAO_DESONERADO' }, SINAPI);
    expect(previa.duplicate).toMatchObject({ id: 'existente' });
    expect(previa.canImport).toBe(false);
  });

  it('SINAPI exige UF, regime e um arquivo só; SICRO não aceita regime desonerado', async () => {
    const { service } = makeService();
    await expect(service.preview({ source: 'SINAPI', regime: 'NAO_DESONERADO' }, SINAPI)).rejects.toThrow(/UF/);
    await expect(service.preview({ source: 'SINAPI', uf: 'SP' }, SINAPI)).rejects.toThrow(/regime/);
    await expect(service.preview({ source: 'SINAPI', uf: 'SP', regime: 'NAO_DESONERADO' }, [...SINAPI, ...SINAPI])).rejects.toThrow(/UM arquivo/);
    await expect(service.preview({ source: 'SICRO', regime: 'DESONERADO' }, SICRO)).rejects.toThrow(/sem desoneração/);
  });

  it('arquivo inválido: erros listados, sem importação', async () => {
    const { service } = makeService();
    const previa = await service.preview({ source: 'SICRO' }, SICRO.filter((a) => !a.originalname.includes('Analítico')));
    expect(previa.errorCount).toBeGreaterThan(0);
    expect(previa.canImport).toBe(false);
  });
});

describe('Bases referenciais — importação', () => {
  const dto = (uf = 'SP', regime: 'NAO_DESONERADO' | 'DESONERADO' = 'NAO_DESONERADO', fileHash: string | null = hashDosArquivos(SINAPI)) => ({
    source: 'SINAPI' as const,
    uf,
    regime,
    fileHash: fileHash ?? undefined,
  });

  it('só confirma a prévia do MESMO arquivo', async () => {
    const { service, prisma } = makeService();
    await expect(service.import(EMPRESA, USUARIO, dto('SP', 'NAO_DESONERADO', null), SINAPI)).rejects.toThrow(BadRequestException);
    await expect(service.import(EMPRESA, USUARIO, dto('SP', 'NAO_DESONERADO', '0'.repeat(64)), SINAPI)).rejects.toThrow(/não é o mesmo/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('primeira base: grava edição, estrutura e preços numa transação e audita UMA vez', async () => {
    const { service, prisma, banco, auditLogger } = makeService();
    await service.import(EMPRESA, USUARIO, dto(), SINAPI);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(banco.edicoes).toEqual([expect.objectContaining({ source: 'SINAPI', competence: '2026-08', versionLabel: '' })]);
    expect(banco.datasets).toEqual([
      expect.objectContaining({ editionId: 'edicao-1', uf: 'SP', regime: 'NAO_DESONERADO', itemCount: 21, compositionCount: 16, importedByCompanyId: EMPRESA }),
    ]);
    expect([banco.insumos.length, banco.composicoes.length, banco.linhas.length]).toEqual([21, 16, 58]);
    expect([banco.precosDeInsumo.length, banco.precosDeComposicao.length]).toEqual([21, 16]);
    // Linha analítica sem preço: ele sai da base.
    expect(banco.linhas[0]).not.toHaveProperty('unitPrice');
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'ReferenceDataset', action: 'CREATE', changes: expect.objectContaining({ itemCount: 21, componentCount: 58 }) }),
    );
  });

  it('outra UF e outro regime da mesma competência: reaproveita a estrutura e grava só os preços', async () => {
    const { service, banco } = makeService();
    await service.import(EMPRESA, USUARIO, dto('SP', 'NAO_DESONERADO'), SINAPI);
    await service.import(EMPRESA, USUARIO, dto('RJ', 'DESONERADO'), SINAPI);

    expect(banco.edicoes).toHaveLength(1);
    expect(banco.datasets.map((d) => [d.uf, d.regime, d.editionId])).toEqual([
      ['SP', 'NAO_DESONERADO', 'edicao-1'],
      ['RJ', 'DESONERADO', 'edicao-1'],
    ]);
    expect([banco.insumos.length, banco.composicoes.length, banco.linhas.length]).toEqual([21, 16, 58]);
    expect([banco.precosDeInsumo.length, banco.precosDeComposicao.length]).toEqual([42, 32]);
    // Os preços das duas bases apontam para as MESMAS linhas de estrutura.
    const composicaoSp = banco.precosDeComposicao[0]!.compositionId;
    expect(banco.precosDeComposicao.filter((p) => p.compositionId === composicaoSp)).toHaveLength(2);
  });

  it('duplicada: 409, nada gravado', async () => {
    const { service, prisma } = makeService({ duplicado: true });
    await expect(service.import(EMPRESA, USUARIO, dto(), SINAPI)).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('base com erro: 400, nada gravado', async () => {
    const { service, prisma } = makeService();
    const incompleto = SICRO.filter((a) => !a.originalname.includes('Analítico'));
    await expect(
      service.import(EMPRESA, USUARIO, { source: 'SICRO', fileHash: hashDosArquivos(incompleto) }, incompleto),
    ).rejects.toThrow(/erro/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falha no meio: o erro sobe de dentro da transação (rollback) e nada é auditado', async () => {
    const { service, auditLogger } = makeService({ falhar: 'precos' });
    await expect(service.import(EMPRESA, USUARIO, dto(), SINAPI)).rejects.toThrow('conexão caiu');
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it('importação simultânea da mesma base: a unique da base vira 409', async () => {
    const { service } = makeService({ falhar: 'unique' });
    await expect(service.import(EMPRESA, USUARIO, dto(), SINAPI)).rejects.toThrow(ConflictException);
  });

  it('outra unique não é confundida com importação simultânea', async () => {
    const { service } = makeService({ falhar: 'unique-estrutura' });
    await expect(service.import(EMPRESA, USUARIO, dto(), SINAPI)).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('lotes respeitam o limite de parâmetros do Postgres', () => {
    const linhas = Array.from({ length: 10_000 }, (_, i) => i);
    const partes = lotes(linhas, 13);
    expect(partes.every((parte) => parte.length * 13 <= 30_000)).toBe(true);
    expect(partes.flat()).toHaveLength(10_000);
  });
});

describe('Bases referenciais — consulta', () => {
  it('busca na base: prefixo de código ou trecho da descrição da estrutura, paginada no servidor', async () => {
    const { service, prisma } = makeService();
    await service.searchItems('aaaaaaaa-0000-4000-8000-000000000001', { page: 2, limit: 50, search: 'piso tátil' });
    expect(prisma.referenceItemPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          datasetId: 'aaaaaaaa-0000-4000-8000-000000000001',
          item: { OR: [{ code: { startsWith: 'PISO TÁTIL' } }, { searchKey: { contains: 'piso tatil' } }] },
        },
        skip: 50,
        take: 50,
      }),
    );
  });
});
