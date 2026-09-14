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

function makeService(opcoes: { duplicado?: boolean; falharNoLote?: 'items' | 'components' | 'unique' | 'unique-item' } = {}) {
  const gravado = { datasets: [] as object[], itens: 0, composicoes: 0, linhas: 0, lotes: 0 };
  const tx = {
    referenceDataset: {
      create: jest.fn(async ({ data }: { data: object }) => {
        if (opcoes.falharNoLote === 'unique') {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '7',
            meta: { target: ['source', 'competence', 'uf', 'regime', 'versionLabel'] },
          });
        }
        if (opcoes.falharNoLote === 'unique-item') {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7', meta: { target: ['datasetId', 'code'] } });
        }
        gravado.datasets.push(data);
        return data;
      }),
    },
    referenceItem: {
      createMany: jest.fn(async ({ data }: { data: object[] }) => {
        if (opcoes.falharNoLote === 'items') throw new Error('conexão caiu');
        gravado.itens += data.length;
        gravado.lotes += 1;
        return { count: data.length };
      }),
    },
    referenceComposition: {
      createMany: jest.fn(async ({ data }: { data: object[] }) => {
        gravado.composicoes += data.length;
        return { count: data.length };
      }),
    },
    referenceCompositionItem: {
      createMany: jest.fn(async ({ data }: { data: object[] }) => {
        if (opcoes.falharNoLote === 'components') throw new Error('conexão caiu');
        gravado.linhas += data.length;
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
          return {
            id: where.id,
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
          };
        }
        return opcoes.duplicado ? { id: 'existente', importedAt: new Date() } : null;
      }),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    referenceItem: { ...tx.referenceItem, findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: unknown) => Promise<unknown>)(tx) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const auditLogger = { log: jest.fn(async () => undefined) };
  const service = new ReferenceDatasetsService(
    prisma as unknown as PrismaService,
    auditLogger as unknown as AuditLoggerService,
  );
  return { service, prisma, tx, auditLogger, gravado };
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
  const dto = (fileHash?: string) => ({ source: 'SINAPI' as const, uf: 'SP', regime: 'NAO_DESONERADO' as const, fileHash });

  it('só confirma a prévia do MESMO arquivo', async () => {
    const { service, prisma } = makeService();
    await expect(service.import(EMPRESA, USUARIO, dto(), SINAPI)).rejects.toThrow(BadRequestException);
    await expect(service.import(EMPRESA, USUARIO, dto('0'.repeat(64)), SINAPI)).rejects.toThrow(/não é o mesmo/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('grava dataset, insumos, composições e linhas analíticas numa transação e audita UMA vez', async () => {
    const { service, prisma, gravado, auditLogger } = makeService();
    await service.import(EMPRESA, USUARIO, dto(hashDosArquivos(SINAPI)), SINAPI);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(gravado.datasets).toEqual([
      expect.objectContaining({
        source: 'SINAPI',
        competence: '2026-08',
        uf: 'SP',
        regime: 'NAO_DESONERADO',
        versionLabel: '',
        itemCount: 21,
        compositionCount: 16,
        importedByCompanyId: EMPRESA,
        importedById: USUARIO,
      }),
    ]);
    expect([gravado.itens, gravado.composicoes, gravado.linhas]).toEqual([21, 16, 58]);
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ReferenceDataset',
        action: 'CREATE',
        changes: expect.objectContaining({ itemCount: 21, compositionCount: 16, componentCount: 58 }),
      }),
    );
  });

  it('duplicada: 409, nada gravado', async () => {
    const { service, prisma } = makeService({ duplicado: true });
    await expect(service.import(EMPRESA, USUARIO, dto(hashDosArquivos(SINAPI)), SINAPI)).rejects.toThrow(ConflictException);
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
    const { service, auditLogger } = makeService({ falharNoLote: 'components' });
    await expect(service.import(EMPRESA, USUARIO, dto(hashDosArquivos(SINAPI)), SINAPI)).rejects.toThrow('conexão caiu');
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it('importação simultânea da mesma base: a unique vira 409', async () => {
    const { service } = makeService({ falharNoLote: 'unique' });
    await expect(service.import(EMPRESA, USUARIO, dto(hashDosArquivos(SINAPI)), SINAPI)).rejects.toThrow(ConflictException);
  });

  it('outra unique (código repetido que escapou) não é confundida com importação simultânea', async () => {
    const { service } = makeService({ falharNoLote: 'unique-item' });
    await expect(service.import(EMPRESA, USUARIO, dto(hashDosArquivos(SINAPI)), SINAPI)).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('lotes respeitam o limite de parâmetros do Postgres', () => {
    const linhas = Array.from({ length: 10_000 }, (_, i) => i);
    const partes = lotes(linhas, 13);
    expect(partes.every((parte) => parte.length * 13 <= 30_000)).toBe(true);
    expect(partes.flat()).toHaveLength(10_000);
  });
});

describe('Bases referenciais — consulta', () => {
  it('busca por prefixo de código ou trecho da descrição, paginada no servidor', async () => {
    const { service, prisma } = makeService();
    await service.searchItems('aaaaaaaa-0000-4000-8000-000000000001', { page: 2, limit: 50, search: 'piso tátil' });
    expect(prisma.referenceItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          datasetId: 'aaaaaaaa-0000-4000-8000-000000000001',
          OR: [{ code: { startsWith: 'PISO TÁTIL' } }, { searchKey: { contains: 'piso tatil' } }],
        },
        skip: 50,
        take: 50,
      }),
    );
  });
});
