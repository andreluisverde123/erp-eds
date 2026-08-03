import { BadRequestException } from '@nestjs/common';

import {
  assertInertAttachment,
  resolveDeliveryContentType,
  resolveImageContentType,
  sanitizeDownloadFileName,
} from './attachment-content';

/// Cobre o vetor que estas funções existem para fechar: anexo com conteúdo
/// ativo (SVG/HTML) sendo devolvido pela API com o Content-Type que o próprio
/// remetente declarou, na mesma origem do SPA.

describe('assertInertAttachment', () => {
  const file = (originalname: string, mimetype: string) => ({ originalname, mimetype });

  it.each([
    ['ataque.svg', 'image/svg+xml'],
    ['ataque.html', 'text/html'],
    ['ataque.xhtml', 'application/xhtml+xml'],
    ['ataque.js', 'text/javascript'],
    ['ataque.xml', 'application/xml'],
  ])('recusa %s', (name, mime) => {
    expect(() => assertInertAttachment(file(name, mime))).toThrow(BadRequestException);
  });

  it('recusa pela extensão mesmo com mimetype disfarçado de PDF', () => {
    expect(() => assertInertAttachment(file('ataque.svg', 'application/pdf'))).toThrow(
      BadRequestException,
    );
  });

  it('recusa pelo mimetype mesmo com extensão inofensiva', () => {
    expect(() => assertInertAttachment(file('inofensivo.pdf', 'image/svg+xml'))).toThrow(
      BadRequestException,
    );
  });

  it('ignora maiúsculas e parâmetros do mimetype', () => {
    expect(() => assertInertAttachment(file('ataque.SVG', 'IMAGE/SVG+XML; charset=utf-8'))).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['contrato.pdf', 'application/pdf'],
    ['obra.jpg', 'image/jpeg'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    // Formatos de CAD/compactado seguem aceitos: a lista é de bloqueio, não de
    // permissão — uma construtora anexa mais coisa do que caberia numa lista
    // fechada, e a garantia real está na entrega.
    ['projeto.dwg', 'application/acad'],
    ['fotos.zip', 'application/zip'],
  ])('aceita %s', (name, mime) => {
    expect(() => assertInertAttachment(file(name, mime))).not.toThrow();
  });
});

describe('resolveDeliveryContentType', () => {
  it.each(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'devolve %s como está',
    (mime) => {
      expect(resolveDeliveryContentType(mime)).toBe(mime);
    },
  );

  it.each([
    'image/svg+xml',
    'text/html',
    'application/javascript',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])('neutraliza %s para octet-stream', (mime) => {
    expect(resolveDeliveryContentType(mime)).toBe('application/octet-stream');
  });

  it('neutraliza mimeType ausente', () => {
    expect(resolveDeliveryContentType(null)).toBe('application/octet-stream');
    expect(resolveDeliveryContentType(undefined)).toBe('application/octet-stream');
  });
});

describe('resolveImageContentType', () => {
  it('deriva o tipo do logo pela extensão', () => {
    expect(resolveImageContentType('a1b2.png')).toBe('image/png');
    expect(resolveImageContentType('a1b2.JPEG')).toBe('image/jpeg');
    expect(resolveImageContentType('a1b2.webp')).toBe('image/webp');
  });

  it('não devolve image/svg+xml para um .svg que tenha escapado', () => {
    expect(resolveImageContentType('a1b2.svg')).toBe('application/octet-stream');
  });
});

describe('sanitizeDownloadFileName', () => {
  it('remove aspas e quebras de linha (injeção de header)', () => {
    expect(sanitizeDownloadFileName('a"; rm -rf /\r\nX-Injetado: 1')).not.toMatch(/["\r\n]/);
  });

  it('mantém o nome legível e a extensão', () => {
    expect(sanitizeDownloadFileName('Contrato Obra 2026.pdf')).toBe('Contrato Obra 2026.pdf');
  });

  it('transpõe acentos em vez de destruir o nome', () => {
    expect(sanitizeDownloadFileName('Medição.pdf')).toBe('Medicao.pdf');
  });

  it('cai num nome padrão quando não sobra nada', () => {
    expect(sanitizeDownloadFileName(null)).toBe('arquivo');
    expect(sanitizeDownloadFileName('   ')).toBe('arquivo');
  });
});
