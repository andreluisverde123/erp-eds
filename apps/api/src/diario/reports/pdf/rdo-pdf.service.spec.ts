import { NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';

import type { PrismaService } from '../../../prisma/prisma.service';
import type { StorageService } from '../../../storage/storage.module';
import type { AuditLoggerService } from '../../../common/services/audit-logger.service';
import { SiteAccessService } from '../../access/site-access.service';
import { DailyReportsService } from '../daily-reports.service';
import { MAX_RDOS_POR_LOTE, RdoPdfService } from './rdo-pdf.service';
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

function montar(
  inicial: LinhaRdo[] = [rdo({ id: 'rdo-existente' })],
  filhos: Partial<BancoFalso> = {},
) {
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

    const outraObra = await service
      .export(EMPRESA_A, ENGENHEIRO_A, 'beta-1')
      .catch((e: Error) => e.message);
    const inexistente = await service
      .export(EMPRESA_A, ENGENHEIRO_A, 'nao-existe')
      .catch((e: Error) => e.message);

    // A exportação não pode virar o oráculo de enumeração que a leitura fechou.
    expect(outraObra).toBe(inexistente);
  });
});

describe('Exportação do RDO em PDF — páginas', () => {
  it('sem fotos, o documento é uma página só', async () => {
    const { service } = montar();

    expect(
      await contarPaginas((await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente')).bytes),
    ).toBe(1);
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

  it('lê no máximo quatro fotos ao mesmo tempo, e todas entram', async () => {
    const { service, storage } = montar([rdo({ id: 'rdo-existente' })], {
      media: fotos(20),
    } as unknown as Partial<BancoFalso>);
    let emAndamento = 0;
    let pico = 0;
    storage.getStream.mockImplementation(async () => {
      emAndamento += 1;
      pico = Math.max(pico, emAndamento);
      await new Promise((fim) => setTimeout(fim, 5));
      emAndamento -= 1;
      return Readable.from([PNG_1X1]);
    });

    const { bytes } = await service.export(EMPRESA_A, ENGENHEIRO_A, 'rdo-existente');

    // Vinte originais carregados juntos seriam dezenas de MB parados na
    // memória do processo; um por vez faria cada foto esperar a anterior.
    expect(storage.getStream).toHaveBeenCalledTimes(20);
    expect(pico).toBe(4);
    expect(await contarPaginas(bytes)).toBe(7);
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

describe('Exportação em lote — vários RDOs num PDF', () => {
  const tres = [
    rdo({ id: 'r-3', number: 3, reportDate: new Date('2026-09-03T00:00:00.000Z') }),
    rdo({ id: 'r-1', number: 1, reportDate: new Date('2026-09-01T00:00:00.000Z') }),
    rdo({ id: 'r-2', number: 2, reportDate: new Date('2026-09-02T00:00:00.000Z') }),
  ];

  it('junta os relatórios, cada um começando em página nova', async () => {
    const { service } = montar(tres);

    const { bytes, nomeArquivo } = await service.exportBatch(EMPRESA_A, ENGENHEIRO_A, [
      'r-3',
      'r-1',
      'r-2',
    ]);

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(await contarPaginas(bytes)).toBe(3);
    // O período vem das datas dos relatórios, não da ordem em que chegaram.
    expect(nomeArquivo).toMatch(/^RDOs-.+-2026-09-01-a-2026-09-03\.pdf$/);
  });

  it('relatório com fotos ocupa as mesmas páginas que ocuparia sozinho', async () => {
    const midia = fotos(1);
    const { service } = montar(tres, {
      media: [{ ...midia[0]!, dailyReportId: 'r-1' }],
    } as unknown as Partial<BancoFalso>);

    const { bytes } = await service.exportBatch(EMPRESA_A, ENGENHEIRO_A, ['r-1', 'r-2']);

    // r-1 com uma foto dá 2 páginas (como na exportação avulsa) e r-2, 1. A
    // foto não vaza para o relatório seguinte.
    expect(await contarPaginas(bytes)).toBe(3);
  });

  it('id repetido entra uma vez só', async () => {
    const { service } = montar(tres);

    const { bytes } = await service.exportBatch(EMPRESA_A, ENGENHEIRO_A, ['r-1', 'r-1', 'r-2']);

    expect(await contarPaginas(bytes)).toBe(2);
  });

  it('um relatório de obra não vinculada derruba o lote inteiro', async () => {
    const { service } = montar([...tres, rdo({ id: 'beta-1', constructionSiteId: BETA })]);

    // Sair um PDF menor do que o pedido, calado, seria pior que o erro.
    await expect(
      service.exportBatch(EMPRESA_A, ENGENHEIRO_A, ['r-1', 'beta-1']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa lista vazia e lista acima do teto', async () => {
    const { service } = montar(tres);

    await expect(service.exportBatch(EMPRESA_A, ENGENHEIRO_A, [])).rejects.toThrow(
      'Escolha ao menos um relatório.',
    );
    const muitos = Array.from({ length: MAX_RDOS_POR_LOTE + 1 }, (_, i) => `r-${i}`);
    await expect(service.exportBatch(EMPRESA_A, ENGENHEIRO_A, muitos)).rejects.toThrow(
      `Exporte até ${MAX_RDOS_POR_LOTE} relatórios por arquivo.`,
    );
  });
});
