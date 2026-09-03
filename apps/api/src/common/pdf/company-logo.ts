import { Logger } from '@nestjs/common';
import { extname } from 'node:path';

import type { Readable } from 'node:stream';

/// SÓ a leitura, e não o `StorageDriver` inteiro.
///
/// Assinar o contrato pelo que se usa deixa `StorageService` (a fachada, que
/// tem `saveUpload` em vez de `save`) servir sem adaptador, e deixa o teste
/// passar um dublê de uma linha em vez de implementar gravação e remoção que
/// esta função nunca chama.
interface LeitorDeArquivo {
  getStream(key: string): Promise<Readable>;
}

const logger = new Logger('CompanyLogo');

/// Formatos que o pdfkit sabe desenhar. **PNG e JPEG, e mais nada.**
///
/// O upload do logo aceita PNG, JPEG e WEBP (ver `company.controller.ts`), mas
/// o pdfkit não lê WEBP — ele lança ao receber os bytes. Uma empresa que
/// tivesse subido um `.webp` veria a impressão da ordem de compra parar de
/// funcionar, e o erro não diria nada sobre logo.
///
/// SVG também não entra, e por isso `apps/web/public/logo-eds.svg` não serve
/// aqui: o pdfkit desenha bitmap, não vetor.
const FORMATOS_SUPORTADOS = new Set(['.png', '.jpg', '.jpeg']);

/// Teto de bytes. Um logo é da ordem de dezenas de KB; acima disto é engano —
/// e carregar 20 MB na memória a cada PDF gerado derrubaria a API antes de
/// alguém notar que o documento ficou feio.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/// Os bytes do logo da empresa, prontos para o cabeçalho do PDF.
///
/// **Devolve `null` em vez de falhar, sempre.** O logo é enfeite; a ordem de
/// compra é documento que vai ao fornecedor. Arquivo apagado do storage,
/// formato que o pdfkit não lê, S3 fora do ar — nada disso pode impedir alguém
/// de imprimir o pedido. O documento sai sem logo, exatamente como saía antes
/// desta funcionalidade, e o motivo fica no log.
///
/// De onde vem: `Company.logoUrl`, o mesmo arquivo que o cabeçalho da
/// interface já exibe e que se sobe em Configurações > Empresa. Nenhum asset
/// novo foi versionado, e nenhuma marca ficou embutida no código — em uma base
/// multi-empresa, cada uma imprime a sua.
export async function loadCompanyLogo(
  storage: LeitorDeArquivo,
  logoUrl: string | null | undefined,
): Promise<Buffer | null> {
  if (!logoUrl) return null;

  const extensao = extname(logoUrl).toLowerCase();
  if (!FORMATOS_SUPORTADOS.has(extensao)) {
    logger.warn(
      `Logo da empresa em formato que o PDF não suporta ("${extensao}"). ` +
        'O documento será gerado sem logo — regrave o arquivo em PNG ou JPEG.',
    );
    return null;
  }

  try {
    const stream = await storage.getStream(logoUrl);
    const partes: Buffer[] = [];
    let total = 0;

    for await (const parte of stream) {
      const bloco = parte as Buffer;
      total += bloco.length;
      if (total > MAX_LOGO_BYTES) {
        // `destroy` para não continuar baixando o que já se decidiu descartar.
        stream.destroy();
        logger.warn('Logo da empresa acima do limite. Documento gerado sem logo.');
        return null;
      }
      partes.push(bloco);
    }

    return partes.length > 0 ? Buffer.concat(partes) : null;
  } catch (error) {
    logger.warn(
      `Não foi possível ler o logo da empresa: ${error instanceof Error ? error.message : error}. Documento gerado sem logo.`,
    );
    return null;
  }
}
