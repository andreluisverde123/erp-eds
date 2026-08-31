import { BadRequestException } from '@nestjs/common';

import { inspectMedia } from './media-signature';

/// Cabeçalhos mínimos e reais de cada formato. Não são arquivos válidos
/// inteiros — são exatamente os bytes que a detecção lê, que é o que o teste
/// precisa exercitar.
function jpeg(width: number, height: number): Buffer {
  const cabecalho = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const sof = Buffer.alloc(11);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1); // SOF0
  sof.writeUInt16BE(8, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  // O segmento APP0 declarado acima tem 0x10 bytes; pula-se até o SOF.
  return Buffer.concat([cabecalho, Buffer.alloc(14), sof]);
}

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function webpLossy(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function mp4(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(16, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('isom', 8, 'ascii');
  return buffer;
}

function webm(): Buffer {
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
}

describe('inspectMedia — identificação por assinatura', () => {
  it('reconhece JPEG e lê as dimensões do SOF', () => {
    expect(inspectMedia(jpeg(4032, 3024))).toEqual({
      mimeType: 'image/jpeg',
      width: 4032,
      height: 3024,
    });
  });

  it('reconhece PNG e lê as dimensões do IHDR', () => {
    expect(inspectMedia(png(1920, 1080))).toEqual({
      mimeType: 'image/png',
      width: 1920,
      height: 1080,
    });
  });

  it('reconhece WebP com perdas', () => {
    expect(inspectMedia(webpLossy(800, 600))).toEqual({
      mimeType: 'image/webp',
      width: 800,
      height: 600,
    });
  });

  it('reconhece MP4 pelo box ftyp', () => {
    expect(inspectMedia(mp4())).toEqual({ mimeType: 'video/mp4', width: null, height: null });
  });

  it('reconhece WebM pelo cabeçalho EBML', () => {
    expect(inspectMedia(webm())).toEqual({ mimeType: 'video/webm', width: null, height: null });
  });
});

describe('inspectMedia — o que ela recusa', () => {
  it('recusa HTML disfarçado de imagem', () => {
    // O caso que o `mimetype` do multipart não pega: o cliente declara
    // `image/jpeg`, o nome termina em `.jpg`, e o conteúdo é uma página com
    // script. Aqui só os bytes contam.
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    expect(() => inspectMedia(html)).toThrow(BadRequestException);
  });

  it('recusa SVG, que é o único formato de imagem que executa script', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf8');
    expect(() => inspectMedia(svg)).toThrow(BadRequestException);
  });

  it('recusa PDF', () => {
    expect(() => inspectMedia(Buffer.from('%PDF-1.7\n', 'utf8'))).toThrow(BadRequestException);
  });

  it('recusa executável', () => {
    expect(() => inspectMedia(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toThrow(
      BadRequestException,
    );
  });

  it('recusa arquivo vazio', () => {
    expect(() => inspectMedia(Buffer.alloc(0))).toThrow(BadRequestException);
  });

  it('recusa GIF — não está na lista de formatos aceitos', () => {
    expect(() => inspectMedia(Buffer.from('GIF89a', 'ascii'))).toThrow(BadRequestException);
  });
});

describe('inspectMedia — arquivo truncado', () => {
  it('identifica o JPEG mesmo sem encontrar o SOF, com dimensões nulas', () => {
    const truncado = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(inspectMedia(truncado)).toEqual({
      mimeType: 'image/jpeg',
      width: null,
      height: null,
    });
  });
});
