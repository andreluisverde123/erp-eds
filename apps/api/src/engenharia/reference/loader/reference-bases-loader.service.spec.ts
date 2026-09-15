import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConflictException } from '@nestjs/common';

import type { ParsedReferenceDataset } from '../parsing/reference-types';
import type { ReferenceDatasetsService } from '../reference-datasets.service';
import { CARGA_AUTOMATICA, ReferenceBasesLoaderService } from './reference-bases-loader.service';

const FIXTURES = join(__dirname, '..', 'parsing', '__fixtures__');
const PACOTE_SINAPI = [
  { name: 'SINAPI_Referência_2026_08.xlsx', buffer: readFileSync(join(FIXTURES, 'SINAPI_Referência_2026_08-amostra.xlsx')) },
  { name: 'SINAPI_mao_de_obra_2026_08.xlsx', buffer: Buffer.from('outra pasta') },
];
const PACOTE_SICRO = [
  ...readdirSync(FIXTURES)
    .filter((nome) => nome.startsWith('SP 04-2026'))
    .map((name) => ({ name, buffer: readFileSync(join(FIXTURES, name)) })),
  { name: 'SP 04-2026 Relatório Analítico de Composições de Custos.pdf', buffer: Buffer.from('pdf') },
];

/// 14/09/2026: a janela de 5 meses vai de 2026-08 a 2026-04.
const HOJE = new Date('2026-09-14T12:00:00Z');

function montar(existentes: { source: string; competence: string; uf: string; regime: string }[] = []) {
  const prisma = {
    company: { findFirst: jest.fn().mockResolvedValue({ id: 'empresa-1' }) },
    referenceDataset: {
      findMany: jest.fn().mockResolvedValue(existentes),
      deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    referenceEdition: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const importParsed = jest.fn().mockResolvedValue({ id: 'ds' });
  const loader = new ReferenceBasesLoaderService(prisma as never, { importParsed } as unknown as ReferenceDatasetsService);
  const baixados: string[] = [];
  loader.download = jest.fn(async (url: string) => {
    baixados.push(url);
    if (url.includes('SINAPI-2026-08')) return Buffer.from('zip');
    if (url.includes('sp-04-2026')) return Buffer.from('7z');
    return null;
  });
  loader.extract = jest.fn(async (_pacote: Buffer, extensao: 'zip' | '7z', aceitar: (nome: string) => boolean) =>
    (extensao === 'zip' ? PACOTE_SINAPI : PACOTE_SICRO).filter((arquivo) => aceitar(arquivo.name)),
  );
  return { loader, prisma, importParsed, baixados };
}

const gravadas = (importParsed: jest.Mock) =>
  importParsed.mock.calls.map(([, , parsed]: [string, null, ParsedReferenceDataset]) =>
    [parsed.source, parsed.competence, parsed.uf, parsed.regime].join(' '),
  );

describe('Carga das bases oficiais', () => {
  it('baixa só o que falta, grava cada UF e regime, e separa o que a fonte não publicou', async () => {
    const { loader, importParsed, baixados } = montar([
      { source: 'SINAPI', competence: '2026-08', uf: 'SP', regime: 'NAO_DESONERADO' },
    ]);

    const relatorio = await loader.load({ months: 5, ufs: ['SP'], today: HOJE });

    expect(relatorio.window).toEqual({ from: '2026-04', to: '2026-08' });
    expect(relatorio.failed).toEqual([]);
    expect(gravadas(importParsed)).toEqual([
      'SINAPI 2026-08 SP DESONERADO',
      'SINAPI 2026-08 SP SEM_ENCARGOS',
      'SICRO 2026-04 SP NAO_DESONERADO',
    ]);
    expect(relatorio.alreadyLoaded).toBe(1);
    expect(relatorio.unavailable).toEqual([
      'SICRO 2026-08: 1 UF(s)',
      'SINAPI 2026-07',
      'SICRO 2026-07: 1 UF(s)',
      'SINAPI 2026-06',
      'SICRO 2026-06: 1 UF(s)',
      'SINAPI 2026-05',
      'SICRO 2026-05: 1 UF(s)',
      'SINAPI 2026-04',
    ]);
    // Uma competência, um download do SINAPI para os três regimes.
    expect(baixados.filter((url) => url.includes('SINAPI-2026-08'))).toHaveLength(1);

    const [companyId, userId, parsed, arquivos] = importParsed.mock.calls[0];
    expect(companyId).toBe('empresa-1');
    expect(userId).toBeNull();
    expect(parsed.metadata.origin).toBe(CARGA_AUTOMATICA);
    expect(arquivos.fileNames).toEqual(['SINAPI_Referência_2026_08.xlsx']);
    // O PDF do pacote do SICRO não vai para o parser.
    expect(importParsed.mock.calls[2][3].fileNames.every((nome: string) => nome.endsWith('.xlsx'))).toBe(true);
  });

  it('base gravada por outra carga conta como existente; erro numa base não para as outras', async () => {
    const { loader, importParsed } = montar();
    importParsed
      .mockRejectedValueOnce(new ConflictException('já existe'))
      .mockRejectedValueOnce(new Error('banco caiu'))
      .mockResolvedValue({ id: 'ds' });

    const relatorio = await loader.load({ months: 1, ufs: ['SP'], sources: ['SINAPI'], today: HOJE });

    expect(relatorio.alreadyLoaded).toBe(1);
    expect(relatorio.failed).toEqual([{ base: 'SINAPI 2026-08 SP DESONERADO', message: 'banco caiu' }]);
    expect(relatorio.imported).toEqual(['SINAPI 2026-08 SP SEM_ENCARGOS']);
  });

  it('pacote que traz outro mês não é gravado', async () => {
    const { loader, importParsed } = montar();
    loader.download = jest.fn(async (url: string) => (url.includes('SINAPI-2026-07') ? Buffer.from('zip') : null));

    const relatorio = await loader.load({ months: 2, ufs: ['SP'], sources: ['SINAPI'], today: HOJE });

    expect(importParsed).not.toHaveBeenCalled();
    expect(relatorio.failed.map((falha) => falha.message)).toEqual([
      'o pacote contém 2026-08 SP',
      'o pacote contém 2026-08 SP',
      'o pacote contém 2026-08 SP',
    ]);
  });

  it('limpeza: só automáticas, fora da janela e sem uso em orçamento; depois as edições vazias', async () => {
    const { loader, prisma } = montar();
    loader.download = jest.fn(async () => null);

    const relatorio = await loader.load({ months: 12, ufs: ['SP'], purge: true, today: HOJE });

    expect(prisma.referenceDataset.deleteMany).toHaveBeenCalledWith({
      where: {
        competence: { lt: '2025-09' },
        metadata: { path: ['origin'], equals: CARGA_AUTOMATICA },
        budgetItems: { none: {} },
      },
    });
    expect(prisma.referenceEdition.deleteMany).toHaveBeenCalledWith({ where: { datasets: { none: {} } } });
    expect(relatorio).toMatchObject({ purgedDatasets: 4, purgedEditions: 1 });
  });
});
