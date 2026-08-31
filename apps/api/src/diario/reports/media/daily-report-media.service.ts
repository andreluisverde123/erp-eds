import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';

import type { DailyReportMediaType } from '../../../../generated/prisma/client';
import { resolveImageContentType } from '../../../common/uploads/attachment-content';
import { UploadPolicyService } from '../../../common/uploads/upload-policy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../storage/storage.module';
import { DailyReportsService, type DailyReportDetail } from '../daily-reports.service';
import { RegisterMediaDto } from './dto/register-media.dto';
import type { ByteRange } from '../../../storage/storage.types';
import {
  assertSizeWithinLimit,
  assertValidThumbnail,
  extensionForMimeType,
  mediaTypeForMimeType,
} from './media-policy';
import { inspectMedia } from './media-signature';

const MEDIA_NOT_FOUND = 'Arquivo não encontrado neste relatório.';

/// Fotos e vídeos do RDO.
///
/// **Storage reaproveitado, não recriado.** Tudo passa pelo `StorageService`
/// que o ERP já tinha (`src/storage/`), que já abstrai disco local e bucket S3.
/// O Diário não conhece SDK de provider nenhum.
///
/// **Autorização reaproveitada, não recriada.** Escrita passa por
/// `DailyReportsService.assertWritable` (existe → obra vinculada → editável); a
/// leitura do arquivo passa por `findOne`, que aplica o mesmo
/// `SiteAccessService` de sempre. Não há terceiro mecanismo.
@Injectable()
export class DailyReportMediaService {
  private readonly logger = new Logger(DailyReportMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: DailyReportsService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  /// Recebe o arquivo, grava no storage e registra a mídia.
  ///
  /// **Uma requisição, e não "pede URL / envia / confirma".** O upload direto
  /// para o bucket exigiria URL assinada, que esta abstração de storage não
  /// tem — e não teria como ter no driver `local`, que grava em disco. Além
  /// disso, o caminho de três passos cria justamente o problema que o enunciado
  /// pede para evitar: um registro no banco esperando um upload que talvez
  /// nunca termine. Aqui a linha só nasce depois de o arquivo estar gravado, e
  /// upload interrompido não deixa rastro nenhum.
  ///
  /// **A ordem importa.** Storage primeiro, banco depois. Se o banco falhar, o
  /// arquivo recém-gravado é removido — a compensação abaixo. A ordem inversa
  /// produziria uma linha apontando para um arquivo que não existe, que é o
  /// pior dos dois estados: a tela mostraria uma miniatura quebrada e ninguém
  /// saberia por quê.
  async upload(
    companyId: string,
    userId: string,
    reportId: string,
    file: Express.Multer.File,
    dto: RegisterMediaDto,
    /// Miniatura gerada pelo NAVEGADOR, no mesmo passo em que a foto já é
    /// redimensionada antes do upload. Opcional: um cliente que não a envie
    /// continua funcionando, e a rota da miniatura serve o original.
    ///
    /// Ela é validada como qualquer outro arquivo — assinatura, tipo e
    /// tamanho. O que NÃO se verifica é se ela retrata o original: seria
    /// preciso decodificar as duas imagens no servidor, que é exatamente o
    /// custo que gerar no cliente evita. O risco é contido: a miniatura só é
    /// exibida a quem já tem acesso ao original, então o pior caso é alguém
    /// pôr uma imagem enganosa no próprio relatório — e o original, que é a
    /// prova, continua intacto.
    thumbnail?: Express.Multer.File,
  ): Promise<DailyReportDetail> {
    const report = await this.reports.assertWritable(companyId, userId, reportId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo foi enviado.');
    }

    // O tipo sai da ASSINATURA do arquivo, nunca do `mimetype` declarado no
    // multipart — que é um campo de texto que o cliente preenche.
    const assinatura = inspectMedia(file.buffer);
    const type = mediaTypeForMimeType(assinatura.mimeType);
    if (!type) {
      throw new BadRequestException(
        'Formato não aceito. Envie foto em JPEG, PNG ou WebP, ou vídeo em MP4 ou WebM.',
      );
    }

    assertSizeWithinLimit(type, file.size);
    // A empresa pode ter desligado anexos ou apertado o limite em
    // Configurações → Sistema. Vale para foto; vídeo tem teto próprio, porque
    // aquele número (10 MB por omissão) foi escrito para documento e tornaria
    // a seção de vídeo inutilizável.
    if (type === 'PHOTO') {
      await this.uploadPolicy.assertUploadAllowed(companyId, file);
    } else {
      await this.uploadPolicy.assertUploadsEnabled(companyId);
    }

    const pasta = `diario/${companyId}/${report.constructionSiteId}/${reportId}`;
    const { key } = await this.storage.saveUpload(pasta, {
      ...file,
      // A extensão sai do tipo DETECTADO, não do nome enviado: é ela que vira
      // parte da chave no storage.
      originalname: `arquivo${extensionForMimeType(assinatura.mimeType)}`,
      mimetype: assinatura.mimeType,
    });

    // A miniatura vai para um objeto SEPARADO. O original nunca é alterado nem
    // substituído — a grade usa uma, abrir a foto entrega a outra.
    let thumbnailKey: string | null = null;
    if (type === 'PHOTO' && thumbnail?.buffer?.length) {
      try {
        thumbnailKey = await this.saveThumbnail(pasta, thumbnail);
      } catch (error) {
        // Miniatura é otimização, não conteúdo. Se ela falhar, o upload segue
        // e a grade cai no original — melhor uma foto pesada que uma foto
        // perdida.
        await this.removeFromStorage(key, 'após falha ao gravar a miniatura');
        throw error;
      }
    }

    try {
      await this.prisma.dailyReportMedia.create({
        data: {
          dailyReportId: reportId,
          type,
          storageKey: key,
          thumbnailKey,
          // Nome original guardado APENAS como metadado.
          fileName: sanitizeFileName(file.originalname),
          mimeType: assinatura.mimeType,
          sizeBytes: file.size,
          width: assinatura.width,
          height: assinatura.height,
          durationSeconds: type === 'VIDEO' ? (dto.durationSeconds ?? null) : null,
          createdById: userId,
        },
      });
    } catch (error) {
      // Compensação: o arquivo já está no storage e a linha não existe. Sem
      // isto, cada falha de banco deixaria um objeto pago e inalcançável no
      // bucket, que ninguém teria como encontrar depois.
      await this.removeFromStorage(key, 'após falha ao registrar a mídia');
      if (thumbnailKey) {
        await this.removeFromStorage(thumbnailKey, 'após falha ao registrar a mídia');
      }
      throw error;
    }

    return this.reports.findOne(companyId, userId, reportId);
  }

  /// Exclui a mídia: primeiro a linha, depois o arquivo.
  ///
  /// A ordem é escolhida pelo pior caso de cada uma. Removendo a linha
  /// primeiro, uma falha no storage deixa um arquivo órfão — invisível,
  /// inofensivo, e recuperável por uma varredura que compare o bucket com a
  /// tabela. Na ordem inversa, uma falha no banco deixaria uma linha apontando
  /// para arquivo inexistente: a tela mostraria miniatura quebrada e o usuário
  /// tentaria abrir uma foto que não existe mais.
  async remove(
    companyId: string,
    userId: string,
    reportId: string,
    mediaId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const media = await this.prisma.dailyReportMedia.findFirst({
      // `dailyReportId` no filtro: id de mídia de OUTRO relatório simplesmente
      // não casa, e vira 404 — mesmo padrão das outras listas do RDO.
      where: { id: mediaId, dailyReportId: reportId },
      select: { id: true, storageKey: true, thumbnailKey: true },
    });

    if (!media) {
      throw new NotFoundException(MEDIA_NOT_FOUND);
    }

    await this.prisma.dailyReportMedia.delete({ where: { id: media.id } });
    await this.removeFromStorage(media.storageKey, 'após excluir a mídia');
    if (media.thumbnailKey) {
      // A miniatura é removida DEPOIS do original e de forma independente: uma
      // falha aqui deixa um arquivo pequeno órfão no storage, invisível para a
      // aplicação, e não impede a exclusão de concluir. O log é o que permite
      // encontrá-lo numa varredura.
      await this.removeFromStorage(media.thumbnailKey, 'após excluir a miniatura');
    }

    return this.reports.findOne(companyId, userId, reportId);
  }

  /// Conteúdo do arquivo, para a rota que o serve.
  ///
  /// Passa por `findOne`, que aplica o `SiteAccessService`: quem não tem
  /// vínculo com a obra recebe 404 aqui do mesmo jeito que receberia ao tentar
  /// abrir o relatório. É por isso que o arquivo é servido PELA API em vez de
  /// por URL assinada — a URL assinada é um portador, vale por tempo e escapa
  /// desta checagem. É a mesma decisão já registrada em `s3-storage.driver.ts`
  /// e aplicada pelo `FilesController` aos anexos do ERP.
  async openStream(
    companyId: string,
    userId: string,
    reportId: string,
    mediaId: string,
    options: {
      /// `thumb` serve a miniatura; sem ela gravada, cai no original. A
      /// miniatura é mídia protegida como qualquer outra — mesma rota
      /// autenticada, mesma checagem de vínculo com a obra.
      variant?: 'original' | 'thumb';
      range?: ByteRange;
    } = {},
  ): Promise<{
    stream: Readable;
    mimeType: string;
    type: DailyReportMediaType;
    /// Tamanho total do OBJETO servido, para o `Content-Length` e o
    /// `Content-Range`.
    sizeBytes: number;
  }> {
    await this.reports.findOne(companyId, userId, reportId);

    const media = await this.prisma.dailyReportMedia.findFirst({
      where: { id: mediaId, dailyReportId: reportId },
      select: {
        storageKey: true,
        thumbnailKey: true,
        mimeType: true,
        type: true,
        sizeBytes: true,
      },
    });

    if (!media) {
      throw new NotFoundException(MEDIA_NOT_FOUND);
    }

    const usarMiniatura = options.variant === 'thumb' && media.thumbnailKey !== null;
    const key = usarMiniatura ? media.thumbnailKey! : media.storageKey;

    return {
      stream: await this.storage.getStream(key, options.range),
      // O tipo da miniatura sai da EXTENSÃO da chave, que o servidor gerou a
      // partir da assinatura do arquivo no upload — não de um valor fixo.
      //
      // Estava cravado em `image/jpeg` porque o navegador sempre a produz
      // assim; mas a API aceita PNG e WebP como miniatura, e aí a resposta
      // mentia sobre o tipo. Com o `nosniff` que acompanha estas rotas, o
      // navegador não corrige por conta própria: ele simplesmente recusa
      // renderizar. Encontrado enviando uma miniatura PNG de verdade.
      mimeType: usarMiniatura ? resolveImageContentType(media.thumbnailKey!) : media.mimeType,
      type: media.type,
      // O tamanho da miniatura não é guardado — ela nunca é servida com Range
      // (é uma imagem pequena), e o `Content-Length` sai do próprio stream.
      sizeBytes: usarMiniatura ? 0 : media.sizeBytes,
    };
  }

  /// Grava a miniatura, validando-a como qualquer outro arquivo: assinatura,
  /// tipo e tamanho. Devolve a chave do objeto.
  private async saveThumbnail(pasta: string, thumbnail: Express.Multer.File): Promise<string> {
    const assinatura = inspectMedia(thumbnail.buffer);
    assertValidThumbnail(assinatura.mimeType, thumbnail.size);

    const { key } = await this.storage.saveUpload(`${pasta}/miniaturas`, {
      ...thumbnail,
      originalname: `miniatura${extensionForMimeType(assinatura.mimeType)}`,
      mimetype: assinatura.mimeType,
    });

    return key;
  }

  /// Remoção best-effort no storage. Falhar aqui NUNCA derruba a operação de
  /// negócio: no upload a exceção original é a que importa, e na exclusão a
  /// mídia já saiu do relatório. O log é o que permite encontrar o órfão
  /// depois.
  private async removeFromStorage(key: string, contexto: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.error(
        `Falha ao remover "${key}" do storage ${contexto}. Arquivo órfão — remover manualmente.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

/// O nome original é dado do usuário e vai para o banco e para a tela. Não vira
/// caminho em lugar nenhum (a chave é gerada pelo servidor), mas continua
/// merecendo limpeza: caracteres de controle e 300 caracteres de lixo numa
/// lista não ajudam ninguém.
function sanitizeFileName(fileName: string | undefined): string {
  const limpo = Array.from(fileName ?? '')
    // Caracteres de controle fora — comparados por código, e não por regex, que
    // o lint (com razão) recusa quando o padrão os traz literalmente.
    .filter((caractere) => {
      const codigo = caractere.codePointAt(0)!;
      return codigo > 0x1f && codigo !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, 150);

  return limpo || 'arquivo';
}
