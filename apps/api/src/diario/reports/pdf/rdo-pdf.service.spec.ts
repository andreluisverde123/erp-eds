import { NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';

import type { PrismaService } from '../../../prisma/prisma.service';
import type { StorageService } from '../../../storage/storage.module';
import type { AuditLoggerService } from '../../../common/services/audit-logger.service';
import { SiteAccessService } from '../../access/site-access.service';
import { DailyReportsService } from '../daily-reports.service';
import { RdoPdfService } from './rdo-pdf.service';
import {
  BETA,
  EMPRESA_A,
  ENGENHEIRO_A,
  criarAuditLoggerFalso,
  criarPrismaFalso,
  criarStorageMinimo,
  rdo,
  type BancoFalso,
  type LinhaRdo,
} from '../../testing/diario-fixture';

/// PNG 1×1 de verdade. O pdfkit DECODIFICA a imagem ao embutir, então um buffer
/// inventado faria o teste falhar por um motivo que não é o testado.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function fotos(quantidade: number) {
  return Array.from({ length: quantidade }, (_, i) => ({
    id: `foto-${i + 1}`,
    dailyReportId: 'rdo-existente',
    type: 'PHOTO' as const,
    storageKey: `k/${i + 1}.png`,
    thumbnailKey: null,
    fileName: `frente-${i + 1}.png`,
    mimeType: 'image/png',
    sizeBytes: PNG_1X1.length,
    width: 1600,
    height: 900,
    durationSeconds: null,
    createdById: ENGENHEIRO_A,
    createdAt: new Date(2026, 7, 30, 8, i),
  }));
}

function montar(inicial: LinhaRdo[] = [rdo({ id: 'rdo-existente' })], filhos: Partial<BancoFalso> = {}) {
  const { client, db } = criarPrismaFalso(inicial, filhos);
  const prisma = client as unknown as PrismaService;
  const reports = new DailyReportsService(
    prisma,
    new SiteAccessService(prisma),
    criarAuditLoggerFalso() as unknown as AuditLoggerService,
    criarStorageMinimo() as unknown as StorageService,
  );

  const storage = {
    getStream: jest.fn(async () => Readable.from([PNG_1X1])),
  };
  const service = new RdoPdfService(prisma, reports, storage as unknown as StorageService);

  return { service, db, storage };
}

async function contarPaginas(bytes: Buffer): Promise<number> {
  return bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

// ---------------------------------------------------------------------------

describe('Exportação do RDO em PDF — autorização', () => {
  it('quem tem acesso à obra gera o documento', async () => {
    const { service } = montar();

    const { bytes, nomeArquivo } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(nomeArquivo).toMatch(/^RDO-.+-\d{3}-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('relatório de obra não vinculada não é exportável', async () => {
    const { service } = montar([rdo({ id: 'beta-1', constructionSiteId: BETA })]);

    await expect(service.export(EMPRESA_A, ENGENHEIRO_A, 'beta-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('relatório inexistente e de outra obra dão a MESMA resposta', async () => {
    const { service } = montar([rdo({ id: 'beta-1', constructionSiteId: BETA })]);

    const outraObra = await service.export(EMPRESA_A, ENGENHEIRO_A, 'beta-1').catch((e: Error) => e.message);
    const inexistente = await service.export(EMPRESA_A, ENGENHEIRO_A, 'nao-existe').catch((e: Error) => e.message);

    // A exportação não pode virar o oráculo de enumeração que a leitura fechou.
    expect(outraObra).toBe(inexistente);
  });
});

describe('Exportação do RDO em PDF — páginas', () => {
  it('sem fotos, o documento é uma página só', async () => {
    const { service } = montar();

    expect(await contarPaginas((await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente')).bytes)).toBe(1);
  });

  // A contagem inclui a página das assinaturas quando a última página da
  // galeria fica CHEIA: com quatro fotos não sobra altura para a área de
  // assinatura, e ela vai para a folha seguinte. É a exceção prevista — o
  // contrário seria espremer a grade ou deixar a assinatura sobre uma foto.
  it.each([
    [1, 2],
    [4, 3],
    [5, 3],
    [8, 4],
    [9, 4],
  ])('%i foto(s) resultam em %i páginas', async (quantidade, esperado) => {
    const { service } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(quantidade),
    } as unknown as Partial<BancoFalso>);

    const { bytes } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // 4 por página: a quinta abre página nova em vez de espremer a grade.
    expect(await contarPaginas(bytes)).toBe(esperado);
  });

  it('vinte fotos não estouram nem faltam páginas', async () => {
    const { service } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(20),
    } as unknown as Partial<BancoFalso>);

    const { bytes } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // 1 de texto + 5 cheias de galeria + 1 de assinatura.
    expect(await contarPaginas(bytes)).toBe(7);
  });

  it('lê as fotos UMA A UMA, e não todas de uma vez', async () => {
    const { service, storage } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(20),
    } as unknown as Partial<BancoFalso>);

    await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // Vinte originais carregados em paralelo seriam dezenas de MB parados na
    // memória do processo; sequencial, o pico é o PDF mais uma imagem.
    expect(storage.getStream).toHaveBeenCalledTimes(20);
  });

  it('foto ilegível não derruba a exportação', async () => {
    const { service, storage } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(2),
    } as unknown as Partial<BancoFalso>);
    storage.getStream.mockRejectedValueOnce(new Error('ENOENT'));

    const { bytes } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // O texto do RDO vale por si: melhor um relatório sem uma foto que nenhum.
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(await contarPaginas(bytes)).toBe(2);
  });
});

describe('Exportação do RDO em PDF — não altera nada', () => {
  it('relatório finalizado também é exportável', async () => {
    const { service } = montar([rdo({ id: 'rdo-existente', status: 'SUBMITTED' })]);

    const { bytes } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exportar não muda situação, conteúdo nem cria mídia', async () => {
    const { service, db } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(2),
    } as unknown as Partial<BancoFalso>);
    const antes = JSON.stringify({ reports: db.reports, media: db.media });

    await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');
    await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // Exportar é leitura. Duas vezes seguidas também.
    expect(JSON.stringify({ reports: db.reports, media: db.media })).toBe(antes);
  });
});
