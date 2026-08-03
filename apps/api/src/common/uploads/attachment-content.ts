import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

/// Regras de conteúdo dos anexos, do upload até a entrega.
///
/// O problema que este arquivo fecha: `attachments` e `workflow/attachments`
/// aceitavam qualquer tipo de arquivo, gravavam em `Attachment.mimeType` o
/// `mimetype` declarado pelo CLIENTE (campo multipart, não inspeção de
/// conteúdo) e o `FilesController` devolvia o arquivo com esse mesmo tipo,
/// inline. Como o SPA e a API são servidos na MESMA origem (o nginx repassa
/// `/api`) e a CSP do helmet está desligada — a API só responde JSON/arquivo —,
/// um SVG com `<script>` anexado a uma obra executava na origem da aplicação
/// assim que alguém abrisse o anexo.
///
/// A correção principal é na ENTREGA, não no upload: `Content-Disposition:
/// attachment` e um `Content-Type` que a aplicação escolhe (não o remetente)
/// tiram o navegador do papel de interpretador. O filtro de upload abaixo é
/// defesa em profundidade — e é uma lista de BLOQUEIO, não de permissão, de
/// propósito: uma construtora anexa projeto, planilha, foto de obra e formatos
/// de CAD que não cabem numa lista fechada. Bloquear só o que carrega código
/// ativo fecha o vetor sem transformar o anexo num campo restrito.

/// Extensões que o navegador interpreta como documento com script. A extensão
/// importa tanto quanto o mimetype porque é dela que sai a chave no storage
/// (`storage.module.ts` usa `extname(file.originalname)`).
const ACTIVE_CONTENT_EXTENSIONS = new Set([
  '.svg',
  '.svgz',
  '.html',
  '.htm',
  '.xhtml',
  '.xht',
  '.shtml',
  '.xml',
  '.xsl',
  '.xslt',
  '.js',
  '.mjs',
  '.cjs',
  '.swf',
]);

const ACTIVE_CONTENT_MIME_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
  'application/xhtml',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'application/x-shockwave-flash',
]);

/// Tipos que valem a pena exibir no próprio navegador e que não executam
/// script: PDF (visualizador isolado) e imagens rasterizadas. Qualquer outra
/// coisa sai como `application/octet-stream`, que o navegador só sabe baixar.
///
/// SVG está fora de propósito, apesar de ser imagem: é o único formato de
/// imagem que é documento com script.
const INLINE_SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const FALLBACK_MIME_TYPE = 'application/octet-stream';

/// Só o que a checagem precisa. Deliberadamente NÃO é `Express.Multer.File`: no
/// `fileFilter` o Multer entrega o arquivo ainda sem `stream` nem `buffer`
/// (é justamente o gancho de "aceita ou não" antes de ler o conteúdo), e exigir
/// o tipo completo não compila.
interface UploadedFileHeader {
  originalname: string;
  mimetype: string;
}

/// Lança quando o arquivo carrega conteúdo ativo. Usado pelo `fileFilter` do
/// Multer, que roda antes de o arquivo ser lido inteiro para a memória.
export function assertInertAttachment(file: UploadedFileHeader): void {
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype?.toLowerCase().split(';')[0]?.trim() ?? '';

  if (ACTIVE_CONTENT_EXTENSIONS.has(extension) || ACTIVE_CONTENT_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException(
      'Este tipo de arquivo não pode ser anexado por motivo de segurança. ' +
        'Converta para PDF ou imagem antes de enviar.',
    );
  }
}

/// `fileFilter` pronto para o `FileInterceptor`. Assinatura fixada pelo Multer.
export function inertAttachmentFileFilter(
  _req: unknown,
  file: UploadedFileHeader,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  try {
    assertInertAttachment(file);
    callback(null, true);
  } catch (error) {
    callback(error as Error, false);
  }
}

/// Content-Type com que o arquivo é DEVOLVIDO. Nunca ecoa cegamente o que o
/// cliente declarou no upload: só os tipos inertes conhecidos passam, o resto
/// vira download binário.
export function resolveDeliveryContentType(mimeType: string | null | undefined): string {
  const normalized = mimeType?.toLowerCase().split(';')[0]?.trim() ?? '';
  return INLINE_SAFE_MIME_TYPES.has(normalized) ? normalized : FALLBACK_MIME_TYPE;
}

/// O logo da empresa não tem `mimeType` guardado (o `Company` só tem `logoUrl`),
/// então o tipo sai da extensão — que o upload já restringiu a PNG/JPEG/WebP
/// em `company.controller.ts`. Precisa ser explícito porque o `nosniff` que
/// acompanha a resposta impede o navegador de adivinhar, e o front busca o logo
/// como blob (`apiClient.getBlob`): sem `Content-Type` o `<img>` não renderiza.
const IMAGE_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function resolveImageContentType(fileName: string): string {
  return IMAGE_CONTENT_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()] ?? FALLBACK_MIME_TYPE;
}

/// `filename` do `Content-Disposition`. O nome original é dado do usuário e vai
/// para dentro de um header: aspas, quebra de linha e não-ASCII precisam sair,
/// senão o header quebra (ou vira injeção de header).
export function sanitizeDownloadFileName(fileName: string | null | undefined): string {
  const fallback = 'arquivo';
  if (!fileName) return fallback;

  const cleaned = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos separados pelo NFD acima
    .replace(/[^\w.\- ]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return cleaned || fallback;
}
