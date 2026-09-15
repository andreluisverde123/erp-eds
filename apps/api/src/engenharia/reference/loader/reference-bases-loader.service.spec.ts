import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConflictException } from '@nestjs/common';

import type { ParsedReferenceDataset } from '../parsing/reference-types';
import type { ReferenceDatasetsService } from '../reference-datasets.service';
import { CARGA_AUTOMATICA, ReferenceBasesLoaderService } from './reference-bases-loader.service';

const FIXTURES = join(__dirname, '..', 'parsing', '__fixtures__');
const PACOTE_SINAPI = [
  {
    name: 'SINAPI_Referência_2026_08.xlsx',
    buffer: readFileSync(join(FIXTURES, 'SINAPI_Referência_2026_08-amostra.xlsx')),
  },
  { name: 'SINAPI_mao_de_obra_2026_08.xlsx', buffer: Buffer.from('outra pasta') },
];
const PACOTE_SICRO = [
  ...readdirSync(FIXTURES)
    .filter((nome) => nome.startsWith('SP 04-2026'))
    .map((name) => ({ name, buffer: readFileSync(join(FIXTURES, name)) })),
  {
    name: 'SP 04-2026 Relatório Analítico de Composições de Custos.pdf',
    buffer: Buffer.from('pdf'),
  },
];

/// 14/09/2026: a janela de 5 meses vai de 2026-08 a 2026-04.
const HOJE = new Date('2026-09-14T12:00:00Z');

type Linha = {
  id?: string;
  source: string;
  competence: string;
  uf: string;
  regime: string;
  metadata?: unknown;
};

function montar(existentes: Linha[] = [], todasAsBases: Linha[] = []) {
  const prisma = {
    company: { findFirst: jest.fn().mockResolvedValue({ id: 'empresa-1' }) },
    referenceDataset: {
      // A limpeza do modo `latestOnly` pede o `id`; a busca do que existe, não.
      findMany: jest.fn(async (args: { select: { id?: boolean } }) =>
        args.select.id ? todasAsBases : existentes,
      ),
      deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    referenceEdition: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const importParsed = jest.fn().mockResolvedValue({ id: 'ds' });
  const loader = new ReferenceBasesLoaderService(
    prisma as never,
    { importParsed } as unknown as ReferenceDatasetsService,
  );
  const baixados: string[] = [];
  loader.download = jest.fn(async (url: string) => {
    baixados.push(url);
    if (url.includes('SINAPI-2026-08')) return Buffer.from('zip');
    if (url.includes('sp-04-2026')) return Buffer.from('7z');
    return null;
  });
  loader.extract = jest.fn(
    async (_pacote: Buffer, extensao: 'zip' | '7z', aceitar: (nome: string) => boolean) =>
      (extensao === 'zip' ? PACOTE_SINAPI : PACOTE_SICRO).filter((arquivo) =>
        aceitar(arquivo.name),
      ),
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
    expect(
      importParsed.mock.calls[2][3].fileNames.every((nome: string) => nome.endsWith('.xlsx')),
    ).toBe(true);
  });

  it('base gravada por outra carga conta como existente; erro numa base não para as outras', async () => {
    const { loader, importParsed } = montar();
    importParsed
      .mockRejectedValueOnce(new ConflictException('já existe'))
      .mockRejectedValueOnce(new Error('banco caiu'))
      .mockResolvedValue({ id: 'ds' });

    const relatorio = await loader.load({
      months: 1,
      ufs: ['SP'],
      sources: ['SINAPI'],
      today: HOJE,
    });

    expect(relatorio.alreadyLoaded).toBe(1);
    expect(relatorio.failed).toEqual([
      { base: 'SINAPI 2026-08 SP DESONERADO', message: 'banco caiu' },
    ]);
    expect(relatorio.imported).toEqual(['SINAPI 2026-08 SP SEM_ENCARGOS']);
  });

  it('pacote que traz outro mês não é gravado', async () => {
    const { loader, importParsed } = montar();
    loader.download = jest.fn(async (url: string) =>
      url.includes('SINAPI-2026-07') ? Buffer.from('zip') : null,
    );

    const relatorio = await loader.load({
      months: 2,
      ufs: ['SP'],
      sources: ['SINAPI'],
      today: HOJE,
    });

    expect(importParsed).not.toHaveBeenCalled();
    expect(relatorio.failed.map((falha) => falha.message)).toEqual([
      'o pacote contém 2026-08 SP',
      'o pacote contém 2026-08 SP',
      'o pacote contém 2026-08 SP',
    ]);
  });

  it('limpeza da janela: só automáticas das fontes carregadas, anteriores à janela e sem uso em orçamento', async () => {
    const { loader, prisma } = montar();
    loader.download = jest.fn(async () => null);

    const relatorio = await loader.load({
      months: 12,
      ufs: ['SP'],
      sources: ['SINAPI'],
      purge: true,
      today: HOJE,
    });

    expect(prisma.referenceDataset.deleteMany).toHaveBeenCalledWith({
      where: {
        source: { in: ['SINAPI'] },
        competence: { lt: '2025-09' },
        metadata: { path: ['origin'], equals: CARGA_AUTOMATICA },
        budgetItems: { none: {} },
      },
    });
    expect(prisma.referenceEdition.deleteMany).toHaveBeenCalledWith({
      where: { datasets: { none: {} } },
    });
    expect(relatorio).toMatchObject({ purgedDatasets: 4, purgedEditions: 1 });
  });

  describe('só a última publicação', () => {
    it('SINAPI para no mês mais novo publicado; SICRO procura o trimestre mais novo de cada UF', async () => {
      // Outubro: setembro ainda não saiu, agosto sim.
      const { loader, importParsed, baixados } = montar();

      const relatorio = await loader.load({
        months: 8,
        latestOnly: true,
        ufs: ['SP'],
        today: new Date('2026-10-14T12:00:00Z'),
      });

      expect(gravadas(importParsed)).toEqual([
        'SINAPI 2026-08 SP NAO_DESONERADO',
        'SINAPI 2026-08 SP DESONERADO',
        'SINAPI 2026-08 SP SEM_ENCARGOS',
        'SICRO 2026-04 SP NAO_DESONERADO',
      ]);
      expect(relatorio.unavailable).toEqual(['SINAPI 2026-09']);
      expect(relatorio.failed).toEqual([]);
      // Achou agosto: julho nem é consultado. Achou abril: março também não.
      expect(baixados.some((url) => url.includes('SINAPI-2026-07'))).toBe(false);
      expect(baixados.some((url) => url.includes('sp-03-2026'))).toBe(false);
    });

    it('com a última já no banco, não baixa de novo', async () => {
      const { loader, importParsed, baixados } = montar([
        { source: 'SINAPI', competence: '2026-08', uf: 'SP', regime: 'NAO_DESONERADO' },
        { source: 'SINAPI', competence: '2026-08', uf: 'SP', regime: 'DESONERADO' },
        { source: 'SINAPI', competence: '2026-08', uf: 'SP', regime: 'SEM_ENCARGOS' },
        { source: 'SICRO', competence: '2026-04', uf: 'SP', regime: 'NAO_DESONERADO' },
      ]);

      const relatorio = await loader.load({
        months: 6,
        latestOnly: true,
        ufs: ['SP'],
        today: HOJE,
      });

      expect(importParsed).not.toHaveBeenCalled();
      expect(relatorio.alreadyLoaded).toBe(4);
      expect(baixados.some((url) => url.includes('SINAPI'))).toBe(false);
      expect(baixados.some((url) => url.includes('sp-04-2026'))).toBe(false);
    });

    it('UF sem nenhuma publicação na busca sai como falha', async () => {
      const { loader } = montar();
      loader.download = jest.fn(async () => null);

      const relatorio = await loader.load({
        months: 3,
        latestOnly: true,
        ufs: ['RR'],
        sources: ['SICRO'],
        today: HOJE,
      });

      expect(relatorio.failed).toEqual([
        { base: 'SICRO RR', message: 'nenhuma publicação nos últimos 3 meses' },
      ]);
    });

    it('limpeza: só automáticas mais antigas que a última da mesma fonte/UF/regime, e sem uso em orçamento', async () => {
      const auto = { origin: CARGA_AUTOMATICA };
      const { loader, prisma } = montar(
        [],
        [
          {
            id: 'sp-ago',
            source: 'SINAPI',
            uf: 'SP',
            regime: 'NAO_DESONERADO',
            competence: '2026-08',
            metadata: auto,
          },
          {
            id: 'sp-jul',
            source: 'SINAPI',
            uf: 'SP',
            regime: 'NAO_DESONERADO',
            competence: '2026-07',
            metadata: auto,
          },
          // Enviada pela tela: nunca é apagada aqui.
          {
            id: 'sp-jun-tela',
            source: 'SINAPI',
            uf: 'SP',
            regime: 'NAO_DESONERADO',
            competence: '2026-06',
            metadata: {},
          },
          // Única do regime: é a mais recente dele.
          {
            id: 'sp-des-jul',
            source: 'SINAPI',
            uf: 'SP',
            regime: 'DESONERADO',
            competence: '2026-07',
            metadata: auto,
          },
          {
            id: 'rj-ago',
            source: 'SINAPI',
            uf: 'RJ',
            regime: 'NAO_DESONERADO',
            competence: '2026-08',
            metadata: auto,
          },
        ],
      );
      loader.download = jest.fn(async () => null);

      await loader.load({
        months: 1,
        latestOnly: true,
        ufs: ['SP'],
        sources: ['SINAPI'],
        purge: true,
        today: HOJE,
      });

      expect(prisma.referenceDataset.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { source: { in: ['SINAPI'] }, versionLabel: '' } }),
      );
      expect(prisma.referenceDataset.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['sp-jul'] }, budgetItems: { none: {} } },
      });
      expect(prisma.referenceEdition.deleteMany).toHaveBeenCalledWith({
        where: { datasets: { none: {} } },
      });
    });
  });
});
