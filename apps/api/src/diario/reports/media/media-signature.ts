import { BadRequestException } from '@nestjs/common';

/// O que a inspeção do conteúdo descobriu sobre o arquivo.
export interface MediaSignature {
  /// Tipo real, deduzido dos primeiros bytes — não o que o cliente declarou.
  mimeType: string;
  /// Dimensões, quando o formato as expõe no cabeçalho. Nulas para vídeo.
  width: number | null;
  height: number | null;
}

/// Identifica o arquivo pela ASSINATURA e, de quebra, mede a imagem.
///
/// **Por que não confiar no `mimetype` do multipart.** Ele é um campo de texto
/// que o cliente preenche. Um `.mp4` com `Content-Type: image/jpeg`, ou um
/// HTML com `.png` no nome, passam por qualquer checagem que só olhe o que foi
/// declarado. Aqui os primeiros bytes decidem, e a extensão gravada no storage
/// sai do tipo detectado — não do nome que veio junto.
///
/// **Por que sem biblioteca.** Ler quatro cabeçalhos é código curto e sem
/// dependência nova; e as bibliotecas de identificação de tipo trazem dezenas
/// de formatos que esta lista não quer aceitar, o que aumentaria a superfície
/// em vez de reduzi-la.
///
/// As dimensões saem do mesmo trabalho: o cabeçalho que identifica o formato é
/// o mesmo que carrega largura e altura, então medir a imagem no servidor sai
/// de graça — e o número deixa de depender do que o navegador informou.
export function inspectMedia(buffer: Buffer): MediaSignature {
  const assinatura = detectar(buffer);

  if (!assinatura) {
    throw new BadRequestException(
      'Formato de arquivo não reconhecido. Envie JPEG, PNG, WebP, MP4 ou WebM.',
    );
  }

  return assinatura;
}

function detectar(buffer: Buffer): MediaSignature | null {
  return lerJpeg(buffer) ?? lerPng(buffer) ?? lerWebp(buffer) ?? lerMp4(buffer) ?? lerWebm(buffer);
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

/// JPEG: `FF D8 FF`, e as dimensões vivem num marcador SOF que aparece depois
/// de um número variável de segmentos — daí a varredura.
///
/// A orientação EXIF NÃO é lida aqui de propósito: o navegador já grava o
/// pixel na orientação certa quando a foto é recomprimida antes do upload (ver
/// `image-compression.ts` no front), então o que chega é uma imagem já
/// endireitada. Interpretar EXIF no servidor sobre um arquivo já corrigido
/// giraria a foto de novo.
function lerJpeg(buffer: Buffer): MediaSignature | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return null;
  }

  let posicao = 2;
  while (posicao + 9 < buffer.length) {
    if (buffer[posicao] !== 0xff) {
      posicao += 1;
      continue;
    }

    const marcador = buffer[posicao + 1]!;
    // SOF0–SOF15, exceto os marcadores que não descrevem quadro (C4, C8, CC).
    const ehQuadro = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);

    if (ehQuadro) {
      return {
        mimeType: 'image/jpeg',
        height: buffer.readUInt16BE(posicao + 5),
        width: buffer.readUInt16BE(posicao + 7),
      };
    }

    const tamanho = buffer.readUInt16BE(posicao + 2);
    if (tamanho < 2) break;
    posicao += 2 + tamanho;
  }

  // Assinatura confere mas o SOF não foi encontrado (arquivo truncado): o tipo
  // é JPEG, as dimensões é que ficam desconhecidas.
  return { mimeType: 'image/jpeg', width: null, height: null };
}

/// PNG: assinatura de 8 bytes seguida do chunk IHDR, que traz as dimensões em
/// posição fixa.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function lerPng(buffer: Buffer): MediaSignature | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) return null;

  return {
    mimeType: 'image/png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/// WebP: contêiner RIFF com o marcador `WEBP`. As dimensões dependem da
/// variante (VP8 com perdas, VP8L sem perdas, VP8X estendido).
function lerWebp(buffer: Buffer): MediaSignature | null {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const variante = buffer.toString('ascii', 12, 16);
  const base = { mimeType: 'image/webp', width: null, height: null } as MediaSignature;

  if (variante === 'VP8 ') {
    return {
      ...base,
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (variante === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { ...base, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (variante === 'VP8X') {
    // 24 bits little-endian, menos um.
    const largura = buffer.readUIntLE(24, 3) + 1;
    const altura = buffer.readUIntLE(27, 3) + 1;
    return { ...base, width: largura, height: altura };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Vídeos
// ---------------------------------------------------------------------------

/// MP4/QuickTime: box `ftyp` nos bytes 4–8. A marca do container (`isom`,
/// `mp42`, `qt  `…) varia conforme o aparelho que gravou; o que identifica o
/// formato é o box, não a marca.
///
/// Dimensões e duração não são lidas: exigiriam percorrer a árvore de boxes
/// até `moov > trak > tkhd`, e um parser de contêiner é uma superfície de
/// ataque bem maior do que o benefício de saber a largura de um vídeo.
function lerMp4(buffer: Buffer): MediaSignature | null {
  if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') return null;
  return { mimeType: 'video/mp4', width: null, height: null };
}

/// WebM/Matroska: cabeçalho EBML `1A 45 DF A3`.
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function lerWebm(buffer: Buffer): MediaSignature | null {
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(WEBM_MAGIC)) return null;
  return { mimeType: 'video/webm', width: null, height: null };
}
