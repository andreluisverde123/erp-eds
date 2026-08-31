import { BadRequestException } from '@nestjs/common';

import type { DailyReportMediaType } from '../../../../generated/prisma/client';

/// Teto absoluto por tipo, em bytes.
///
/// **De onde vêm os números.** O `AttachmentsController` já usa 25 MB como
/// teto do processo, e o nginx que serve a aplicação declara
/// `client_max_body_size 25m` no `location /api/` — um arquivo maior nem chega
/// à API, e o usuário recebe um 413 que a aplicação não escreveu e não sabe
/// explicar. Manter a foto em 10 MB e o vídeo em 25 MB deixa os dois limites
/// dentro do que a infraestrutura já aceita hoje.
///
/// **Por que não os 100 MB do enunciado.** Três razões, nesta ordem: o nginx
/// recusaria antes; o upload passa por `memoryStorage()` do Multer (padrão do
/// projeto), então o arquivo inteiro fica em RAM e três envios simultâneos de
/// 100 MB derrubariam um container pequeno; e o caminho que tornaria 100 MB
/// razoável — upload direto para o bucket com URL assinada — não existe nesta
/// abstração de storage e não funcionaria com o driver `local`.
///
/// Subir o limite é uma mudança de três linhas (esta constante, o teto do
/// Multer no controller e o `client_max_body_size`), e vale a pena quando
/// houver o upload direto. Enquanto isso, 25 MB comportam bem o clipe curto de
/// apoio que a seção se propõe a guardar.
export const MEDIA_SIZE_LIMITS: Record<DailyReportMediaType, number> = {
  PHOTO: 10 * 1024 * 1024,
  VIDEO: 25 * 1024 * 1024,
};

/// Teto do Multer: o maior dos dois. O arquivo vai para a memória ANTES de
/// qualquer checagem nossa, então este é o número que protege o processo; o
/// limite por tipo é conferido depois, e só pode ser mais restritivo.
export const MEDIA_MAX_FILE_SIZE_BYTES = Math.max(...Object.values(MEDIA_SIZE_LIMITS));

/// Formatos aceitos, com a extensão que o servidor dá ao objeto no storage.
///
/// Lista de PERMISSÃO, e não de bloqueio como em `attachment-content.ts`.
/// A diferença é o propósito: anexo de obra pode ser projeto, planilha ou
/// formato de CAD que não cabe numa lista fechada, então lá se bloqueia o que
/// carrega código. Aqui o conteúdo é evidência visual — quatro formatos cobrem
/// tudo que uma câmera de celular produz, e qualquer coisa fora disso é erro
/// ou ataque.
///
/// SVG está deliberadamente ausente: é o único formato de imagem que é
/// documento com script.
const FORMATOS: {
  mimeType: string;
  extension: string;
  type: DailyReportMediaType;
}[] = [
  { mimeType: 'image/jpeg', extension: '.jpg', type: 'PHOTO' },
  { mimeType: 'image/png', extension: '.png', type: 'PHOTO' },
  { mimeType: 'image/webp', extension: '.webp', type: 'PHOTO' },
  { mimeType: 'video/mp4', extension: '.mp4', type: 'VIDEO' },
  { mimeType: 'video/webm', extension: '.webm', type: 'VIDEO' },
];

const POR_MIME = new Map(FORMATOS.map((formato) => [formato.mimeType, formato]));

export const ALLOWED_MEDIA_MIME_TYPES = FORMATOS.map((formato) => formato.mimeType);

export function extensionForMimeType(mimeType: string): string {
  return POR_MIME.get(mimeType)?.extension ?? '.bin';
}

export function mediaTypeForMimeType(mimeType: string): DailyReportMediaType | null {
  return POR_MIME.get(mimeType)?.type ?? null;
}

/// Recusa o arquivo cujo tamanho não cabe no tipo DETECTADO.
export function assertSizeWithinLimit(type: DailyReportMediaType, sizeBytes: number): void {
  const limite = MEDIA_SIZE_LIMITS[type];
  if (sizeBytes > limite) {
    const rotulo = type === 'PHOTO' ? 'A foto' : 'O vídeo';
    throw new BadRequestException(
      `${rotulo} tem ${formatMb(sizeBytes)} e excede o limite de ${formatMb(limite)}.`,
    );
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

/// Teto da miniatura.
///
/// Ela é gerada no navegador a ~320px de lado maior, em JPEG — na prática sai
/// entre 10 e 40 KB. 200 KB é folga generosa para o caso de uma imagem muito
/// detalhada, e ao mesmo tempo baixo o bastante para que uma "miniatura" de
/// 3 MB (cliente adulterado, ou bug) seja recusada antes de ocupar espaço.
export const THUMBNAIL_MAX_SIZE_BYTES = 200 * 1024;

/// Só imagem pode ser miniatura. Vídeo não tem miniatura gerada — a grade
/// mostra a capa com o ícone, sem baixar nada.
export function assertValidThumbnail(mimeType: string, sizeBytes: number): void {
  if (mediaTypeForMimeType(mimeType) !== 'PHOTO') {
    throw new BadRequestException('A miniatura precisa ser uma imagem.');
  }

  if (sizeBytes > THUMBNAIL_MAX_SIZE_BYTES) {
    throw new BadRequestException('A miniatura enviada é grande demais.');
  }
}
