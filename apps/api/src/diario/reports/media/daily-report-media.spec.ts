import { Logger, ServiceUnavailableException } from '@nestjs/common';

import type { AuditLoggerService } from '../../../common/services/audit-logger.service';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'node:stream';

import type { PrismaService } from '../../../prisma/prisma.service';
import type { StorageService } from '../../../storage/storage.module';
import type { UploadPolicyService } from '../../../common/uploads/upload-policy.service';
import { SiteAccessService } from '../../access/site-access.service';
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
  type LinhaRdo,
} from '../../testing/diario-fixture';
import { DailyReportsService } from '../daily-reports.service';
import { DailyReportMediaService } from './daily-report-media.service';

const RDO_ALPHA = 'rdo-alpha';
const RDO_BETA = 'rdo-beta';

// ---------------------------------------------------------------------------
// Arquivos de teste
// ---------------------------------------------------------------------------

function png(width = 1920, height = 1080): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function mp4(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(16, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('isom', 8, 'ascii');
  return buffer;
}

/// Miniatura como o navegador a envia: um JPEG pequeno, no segundo campo do
/// multipart. O tamanho é informado à parte porque é ele que a política do
/// servidor confere, e os testes precisam simular uma miniatura grande demais.
function miniatura(tamanho = 8_000): Express.Multer.File {
  return arquivo(png(320, 240), { originalname: 'miniatura.jpg', size: tamanho });
}

/// Arquivo multipart como o Multer o entrega. O `mimetype` e o `originalname`
/// vêm do CLIENTE — os testes abaixo mentem neles de propósito, para provar
/// que não decidem nada.
function arquivo(conteudo: Buffer, over: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'IMG_2837.JPG',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: conteudo.length,
    buffer: conteudo,
    stream: Readable.from(conteudo),
    destination: '',
    filename: '',
    path: '',
    ...over,
  } as Express.Multer.File;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

function criarStorageFalso() {
  const objetos = new Map<string, Buffer>();
  let contador = 0;

  const storage = {
    saveUpload: jest.fn(async (folder: string, file: Express.Multer.File) => {
      const key = `${folder}/objeto-${++contador}${file.originalname.slice(file.originalname.lastIndexOf('.'))}`;
      objetos.set(key, file.buffer);
      return { key, fileUrl: `/uploads/${key}` };
    }),
    getStream: jest.fn(async (key: string, range?: { start: number; end: number }) => {
      const conteudo = objetos.get(key);
      if (!conteudo) throw new NotFoundException('Arquivo não encontrado.');
      // O recorte é feito de verdade: um dublê que ignorasse o `range` faria
      // o teste de Range passar mesmo com o driver entregando o arquivo todo.
      return Readable.from(range ? conteudo.subarray(range.start, range.end + 1) : conteudo);
    }),
    exists: jest.fn(async (key: string) => objetos.has(key)),
    remove: jest.fn(async (key: string) => {
      objetos.delete(key);
    }),
  };

  return { storage, objetos };
}

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
  );
  const { storage, objetos } = criarStorageFalso();

  const uploadPolicy = {
    assertUploadAllowed: jest.fn(async () => undefined),
    assertUploadsEnabled: jest.fn(async () => null),
  };

  const media = new DailyReportMediaService(
    prisma,
    reportsService,
    storage as unknown as StorageService,
    uploadPolicy as unknown as UploadPolicyService,
  );

  return { media, reports: reportsService, db, storage, objetos, uploadPolicy };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

describe('Mídia do RDO — upload', () => {
  it('grava o arquivo no storage e registra a foto', async () => {
    const { media, objetos } = montar();

    const relatorio = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    expect(relatorio.photos).toHaveLength(1);
    expect(relatorio.summary.photos).toBe(1);
    expect(objetos.size).toBe(1);
  });

  it('monta a chave a partir de empresa, obra e relatório — nunca do nome enviado', async () => {
    const { media, storage } = montar();

    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    expect(storage.saveUpload).toHaveBeenCalledWith(
      `diario/${EMPRESA_A}/${ALPHA}/${RDO_ALPHA}`,
      expect.objectContaining({ originalname: 'arquivo.png' }),
    );
  });

  it('o nome original vira metadado, e nada além disso', async () => {
    const { media } = montar();

    const relatorio = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png(), { originalname: 'IMG_2837.JPG' }),
      {},
    );

    expect(relatorio.photos[0]!.fileName).toBe('IMG_2837.JPG');
  });

  it('mede a imagem no servidor, a partir do cabeçalho do arquivo', async () => {
    const { media } = montar();

    const relatorio = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png(1600, 1200)),
      {},
    );

    expect(relatorio.photos[0]).toMatchObject({ width: 1600, height: 1200 });
  });

  it('o tipo vem da ASSINATURA, não do que o cliente declarou', async () => {
    // O cliente jura que é `image/jpeg` com nome `.JPG`; os bytes são PNG.
    const { media } = montar();

    const relatorio = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png(), { mimetype: 'image/jpeg', originalname: 'foto.JPG' }),
      {},
    );

    expect(relatorio.photos[0]!.mimeType).toBe('image/png');
  });

  it('registra vídeo com a duração informada pelo navegador', async () => {
    const { media } = montar();

    const relatorio = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(mp4(), { originalname: 'clipe.mp4', mimetype: 'video/mp4' }),
      { durationSeconds: 42 },
    );

    expect(relatorio.videos).toHaveLength(1);
    expect(relatorio.videos[0]).toMatchObject({ mimeType: 'video/mp4', durationSeconds: 42 });
    expect(relatorio.summary.videos).toBe(1);
  });

  it('ignora a duração enviada junto de uma FOTO', async () => {
    const { media } = montar();

    const relatorio = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {
      durationSeconds: 99,
    });

    expect(relatorio.photos[0]!.durationSeconds).toBeNull();
  });

  it('recusa formato fora da lista, e não grava nada', async () => {
    const { media, objetos, db } = montar();
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

    await expect(
      media.upload(
        EMPRESA_A,
        ENGENHEIRO_A,
        RDO_ALPHA,
        arquivo(html, { originalname: 'foto.jpg', mimetype: 'image/jpeg' }),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(objetos.size).toBe(0);
    expect(db.media).toHaveLength(0);
  });

  it('recusa arquivo vazio', async () => {
    const { media } = montar();

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(Buffer.alloc(0)), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa foto acima do limite de 10 MB', async () => {
    const { media, objetos } = montar();

    await expect(
      media.upload(
        EMPRESA_A,
        ENGENHEIRO_A,
        RDO_ALPHA,
        arquivo(png(), { size: 11 * 1024 * 1024 }),
        {},
      ),
    ).rejects.toThrow(/excede o limite/);
    expect(objetos.size).toBe(0);
  });

  it('recusa vídeo acima do limite de 25 MB', async () => {
    const { media } = montar();

    await expect(
      media.upload(
        EMPRESA_A,
        ENGENHEIRO_A,
        RDO_ALPHA,
        arquivo(mp4(), { size: 26 * 1024 * 1024 }),
        {},
      ),
    ).rejects.toThrow(/excede o limite/);
  });

  it('respeita o limite por empresa nas FOTOS', async () => {
    const { media, uploadPolicy } = montar();
    uploadPolicy.assertUploadAllowed.mockRejectedValueOnce(
      new BadRequestException('Arquivo de 8.0 MB excede o limite de 5 MB.'),
    );

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}),
    ).rejects.toThrow(/excede o limite/);
  });

  it('vídeo não passa pelo limite de anexo, mas passa pelo interruptor', async () => {
    // `maxUploadSizeMb` (10 MB por omissão) foi escrito para documento e
    // tornaria a seção de vídeo inutilizável; `allowAttachments` continua
    // valendo, porque quem desligou o envio de arquivos desligou para tudo.
    const { media, uploadPolicy } = montar();

    await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(mp4(), { size: 20 * 1024 * 1024 }),
      {},
    );

    expect(uploadPolicy.assertUploadAllowed).not.toHaveBeenCalled();
    expect(uploadPolicy.assertUploadsEnabled).toHaveBeenCalledWith(EMPRESA_A);
  });

  it('empresa com anexos desligados não envia nem foto nem vídeo', async () => {
    const { media, uploadPolicy, objetos } = montar();
    const desligado = new ForbiddenException('O envio de anexos está desativado.');
    uploadPolicy.assertUploadAllowed.mockRejectedValue(desligado);
    uploadPolicy.assertUploadsEnabled.mockRejectedValue(desligado);

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(mp4()), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(objetos.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Falhas parciais
// ---------------------------------------------------------------------------

describe('Mídia do RDO — falha entre storage e banco', () => {
  it('remove o arquivo do storage quando o registro no banco falha', async () => {
    // Sem esta compensação, cada falha de banco deixaria um objeto pago e
    // inalcançável no bucket.
    const { media, storage, objetos, db } = montar();
    const criar = jest.spyOn(db.media, 'push').mockImplementation(() => {
      throw new Error('conexão perdida');
    });

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}),
    ).rejects.toThrow('conexão perdida');

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(objetos.size).toBe(0);
    criar.mockRestore();
  });

  it('falha do storage NÃO deixa registro no banco, e a causa vai para o log', async () => {
    const { media, storage, db } = montar();
    const causa = new Error('EACCES: permission denied, mkdir /app/apps/api/uploads/diario');
    storage.saveUpload.mockRejectedValueOnce(causa);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // 503, e não 500: a requisição estava correta — quem falhou foi a
    // infraestrutura. E a mensagem NÃO repete o erro do storage, que pode
    // conter caminho de disco ou nome de bucket.
    const erro = await media
      .upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {})
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as Error).message).not.toContain('EACCES');
    expect(db.media).toHaveLength(0);

    // A garantia que faltava quando isto falhou em produção: sem log, o
    // sintoma "envio falhou" não distingue permissão de disco, disco cheio e
    // credencial de bucket vencida.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('GRAVAR mídia no storage'), causa.stack);
    log.mockRestore();
  });

  it('upload interrompido não deixa registro nenhum — não existe estado pendente', async () => {
    const { media, db, objetos } = montar();

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(Buffer.alloc(0)), {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.media).toHaveLength(0);
    expect(objetos.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

describe('Mídia do RDO — exclusão', () => {
  it('remove a linha e o arquivo', async () => {
    const { media, objetos, db } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    const relatorio = await media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id);

    expect(relatorio.photos).toHaveLength(0);
    expect(db.media).toHaveLength(0);
    expect(objetos.size).toBe(0);
  });

  it('falha do storage na exclusão não impede a mídia de sair do relatório', async () => {
    // Órfão no bucket é invisível e recuperável por varredura; linha apontando
    // para arquivo inexistente quebraria a tela do usuário.
    const { media, storage, db } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});
    storage.remove.mockRejectedValueOnce(new Error('bucket indisponível'));

    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id),
    ).resolves.toMatchObject({ summary: { photos: 0 } });
    expect(db.media).toHaveLength(0);
  });

  it('mídia inexistente é 404', async () => {
    const { media } = montar();

    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, 'dddddddd-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

describe('Mídia do RDO — acesso', () => {
  it('usuário sem acesso à obra não envia mídia', async () => {
    const { media, objetos, db } = montar();

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, arquivo(png()), {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(objetos.size).toBe(0);
    expect(db.media).toHaveLength(0);
  });

  it('usuário sem acesso à obra não exclui mídia', async () => {
    const { media, db } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, criado.photos[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.media).toHaveLength(1);
  });

  it('usuário sem acesso à obra não LÊ o arquivo, mesmo com os dois ids', async () => {
    // É o requisito central: não basta esconder a mídia no frontend. Quem
    // descobrir a URL continua sem conseguir baixar o arquivo.
    const { media } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, criado.photos[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mídia de OUTRO relatório não é excluível, mesmo com o id em mãos', async () => {
    const { media, db } = montar();
    const doBeta = await media.upload(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, arquivo(png()), {});

    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.photos[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.media).toHaveLength(1);
  });

  it('mídia de OUTRO relatório não é legível, mesmo com o id em mãos', async () => {
    const { media } = montar();
    const doBeta = await media.upload(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, arquivo(png()), {});

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.photos[0]!.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o fiscal vinculado à obra envia e lê mídia', async () => {
    const { media } = montar();

    const criado = await media.upload(EMPRESA_A, FISCAL, RDO_ALPHA, arquivo(png()), {});

    await expect(
      media.openStream(EMPRESA_A, FISCAL, RDO_ALPHA, criado.photos[0]!.id),
    ).resolves.toMatchObject({ mimeType: 'image/png', type: 'PHOTO' });
  });

  it('relatório fechado não recebe mídia', async () => {
    const { media } = montar({ status: 'APPROVED' });

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a leitura NÃO exige relatório editável — evidência de RDO fechado continua visível', async () => {
    const { media, db } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    // Fecha o relatório DEPOIS de a foto existir. Escrita passa a ser
    // recusada; ler a evidência de um RDO já entregue continua sendo o caso
    // normal — é justamente para isso que ela foi anexada.
    db.reports.find((linha) => linha.id === RDO_ALPHA)!.status = 'APPROVED';

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id),
    ).resolves.toMatchObject({ type: 'PHOTO' });
    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ---------------------------------------------------------------------------
// Cópia
// ---------------------------------------------------------------------------

describe('Mídia do RDO — cópia de relatório', () => {
  it('NÃO copia fotos nem vídeos', async () => {
    const { media, reports } = montar();
    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});
    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(mp4()), {});

    const copia = await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, {
      reportDate: '2026-08-31',
    });

    expect(copia.photos).toHaveLength(0);
    expect(copia.videos).toHaveLength(0);
    expect(copia.summary).toMatchObject({ photos: 0, videos: 0 });
  });

  it('não duplica arquivo no storage ao copiar', async () => {
    const { media, reports, storage, objetos } = montar();
    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});
    storage.saveUpload.mockClear();

    await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { reportDate: '2026-08-31' });

    expect(storage.saveUpload).not.toHaveBeenCalled();
    expect(objetos.size).toBe(1);
  });

  it('a mídia do original permanece intacta', async () => {
    const { media, reports } = montar();
    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});

    await reports.copy(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, { reportDate: '2026-08-31' });
    const original = await reports.findOne(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA);

    expect(original.photos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Miniaturas
// ---------------------------------------------------------------------------

describe('Mídia do RDO — miniatura', () => {
  it('grava a miniatura como objeto SEPARADO, sem tocar no original', async () => {
    const { media, objetos, db } = montar();

    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}, miniatura());

    // Dois objetos: o original e a miniatura.
    expect(objetos.size).toBe(2);
    expect(db.media[0]!.thumbnailKey).toBeTruthy();
    expect(db.media[0]!.thumbnailKey).not.toBe(db.media[0]!.storageKey);
  });

  it('o original é preservado byte a byte', async () => {
    const original = png(1920, 1080);
    const { media, objetos, db } = montar();

    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(original), {}, miniatura());

    expect(objetos.get(db.media[0]!.storageKey as string)).toEqual(original);
  });

  it('a variante `thumb` serve a miniatura, não o original', async () => {
    const { media, storage } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png()),
      {},
      miniatura(),
    );
    storage.getStream.mockClear();

    await media.openStream(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id, {
      variant: 'thumb',
    });

    expect(storage.getStream.mock.calls[0]![0]).toContain('/miniaturas/');
  });

  it('foto SEM miniatura cai no original — a coluna nasceu sem backfill', async () => {
    const { media, storage } = montar();
    const criado = await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {});
    storage.getStream.mockClear();

    const resultado = await media.openStream(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.photos[0]!.id,
      { variant: 'thumb' },
    );

    expect(storage.getStream.mock.calls[0]![0]).not.toContain('/miniaturas/');
    expect(resultado.mimeType).toBe('image/png');
  });

  it('recusa miniatura grande demais, e não deixa nada para trás', async () => {
    const { media, objetos, db } = montar();

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}, miniatura(300 * 1024)),
    ).rejects.toThrow(/miniatura enviada é grande demais/);

    // O original já tinha sido gravado quando a miniatura falhou: a compensação
    // o remove, senão sobraria um objeto pago e sem registro.
    expect(objetos.size).toBe(0);
    expect(db.media).toHaveLength(0);
  });

  it('recusa "miniatura" que não é imagem', async () => {
    const { media } = montar();

    await expect(
      media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(png()), {}, arquivo(mp4())),
    ).rejects.toThrow(/miniatura precisa ser uma imagem/);
  });

  it('vídeo ignora a miniatura enviada — a grade mostra a capa sem baixar nada', async () => {
    const { media, db } = montar();

    await media.upload(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, arquivo(mp4()), {}, miniatura());

    expect(db.media[0]!.thumbnailKey).toBeNull();
  });

  it('a miniatura é PROTEGIDA como o original — outra obra não a lê', async () => {
    const { media } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png()),
      {},
      miniatura(),
    );

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_B, RDO_ALPHA, criado.photos[0]!.id, {
        variant: 'thumb',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excluir a mídia remove o original E a miniatura', async () => {
    const { media, objetos } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png()),
      {},
      miniatura(),
    );
    expect(objetos.size).toBe(2);

    await media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id);

    expect(objetos.size).toBe(0);
  });

  it('falha ao remover a miniatura não impede a exclusão de concluir', async () => {
    // Órfão pequeno e invisível é melhor que uma mídia que o usuário mandou
    // excluir e continua aparecendo no relatório.
    const { media, storage, db } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(png()),
      {},
      miniatura(),
    );
    storage.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('bucket indisponível'));

    await expect(
      media.remove(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, criado.photos[0]!.id),
    ).resolves.toMatchObject({ summary: { photos: 0 } });
    expect(db.media).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

describe('Mídia do RDO — leitura parcial', () => {
  it('entrega só o trecho pedido', async () => {
    const conteudo = mp4();
    const { media } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(conteudo, { originalname: 'clipe.mp4' }),
      {},
    );

    const { stream } = await media.openStream(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.videos[0]!.id,
      { range: { start: 4, end: 7 } },
    );

    const pedaco: Buffer[] = [];
    for await (const bloco of stream) pedaco.push(bloco as Buffer);
    expect(Buffer.concat(pedaco)).toEqual(conteudo.subarray(4, 8));
  });

  it('devolve o tamanho total, que é o que o Content-Range precisa', async () => {
    const conteudo = mp4();
    const { media } = montar();
    const criado = await media.upload(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      arquivo(conteudo, { originalname: 'clipe.mp4' }),
      {},
    );

    const resultado = await media.openStream(
      EMPRESA_A,
      ENGENHEIRO_A,
      RDO_ALPHA,
      criado.videos[0]!.id,
      { range: { start: 0, end: 3 } },
    );

    expect(resultado.sizeBytes).toBe(conteudo.length);
  });

  it('pedir um trecho de mídia de outra obra é negado, como o arquivo inteiro', async () => {
    const { media } = montar();
    const doBeta = await media.upload(EMPRESA_A, ENGENHEIRO_B, RDO_BETA, arquivo(mp4()), {});

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, doBeta.videos[0]!.id, {
        range: { start: 0, end: 10 },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pedir um trecho de mídia inexistente é 404', async () => {
    const { media } = montar();

    await expect(
      media.openStream(EMPRESA_A, ENGENHEIRO_A, RDO_ALPHA, 'dddddddd-0000-4000-8000-000000000001', {
        range: { start: 0, end: 10 },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
