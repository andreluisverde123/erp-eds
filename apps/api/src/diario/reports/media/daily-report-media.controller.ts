import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { DailyReportMediaService } from './daily-report-media.service';
import { RegisterMediaDto } from './dto/register-media.dto';
import { parseRange } from './byte-range';
import { MEDIA_MAX_FILE_SIZE_BYTES } from './media-policy';

/// Fotos e vídeos do RDO.
///
/// A rota que SERVE o arquivo exige apenas `diario.access` (é leitura); enviar
/// e excluir exigem também `diario.report.manage`, como as demais escritas do
/// relatório.
@RequirePermissions('diario.access')
@Controller('diario/relatorios/:reportId/midias')
export class DailyReportMediaController {
  constructor(private readonly media: DailyReportMediaService) {}

  /// Upload em UMA requisição multipart.
  ///
  /// Não há par "pedir URL / confirmar": o storage do ERP não emite URL
  /// assinada (o driver `local` grava em disco e não teria como), e o caminho
  /// de dois passos criaria o registro pendente que o upload interrompido
  /// deixaria para trás. Aqui a linha no banco só nasce depois de o arquivo
  /// estar gravado.
  @RequirePermissions('diario.access', 'diario.report.manage')
  @Post()
  @UseInterceptors(
    // DOIS campos: o arquivo e, para foto, a miniatura que o navegador gerou
    // no mesmo passo em que já redimensiona a imagem antes do upload.
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        // Teto do PROCESSO: o arquivo vai para a memória antes de qualquer
        // checagem nossa. O limite por tipo (foto 10 MB, vídeo 25 MB) é
        // aplicado depois, no serviço, e só pode ser mais restritivo que este.
        //
        // O limite do Multer vale por ARQUIVO, então a miniatura passaria com
        // até 25 MB por aqui; o teto real dela (200 KB) é conferido no
        // serviço, junto com a assinatura.
        limits: { fileSize: MEDIA_MAX_FILE_SIZE_BYTES },
        // Sem `fileFilter` de extensão/mimetype: os dois vêm do cliente e não
        // decidem nada aqui. Quem identifica o arquivo é a assinatura dos
        // primeiros bytes, no serviço — ver `media-signature.ts`.
      },
    ),
  )
  upload(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @UploadedFiles()
    arquivos: { file?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] },
    @Body() dto: RegisterMediaDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.media.upload(
      companyId,
      userId,
      reportId,
      arquivos?.file?.[0] as Express.Multer.File,
      dto,
      arquivos?.thumbnail?.[0],
    );
  }

  @RequirePermissions('diario.access', 'diario.report.manage')
  @Delete(':mediaId')
  remove(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.media.remove(companyId, userId, reportId, mediaId);
  }

  /// Serve o arquivo.
  ///
  /// **Aqui, e não por URL assinada.** Uma URL assinada é um portador: vale por
  /// tempo, funciona para quem a receber e escapa dos guards. Passando pela
  /// API, cada byte servido atravessa o mesmo `SiteAccessService` que decide se
  /// a pessoa pode abrir o relatório — que é exatamente o requisito de "não
  /// basta esconder a mídia no frontend". É a mesma decisão que o ERP já tomou
  /// para os anexos, registrada em `s3-storage.driver.ts` e implementada no
  /// `FilesController`.
  ///
  /// Custa banda do servidor. É a troca aceita, e ela está documentada.
  /// Miniatura da foto.
  ///
  /// Rota própria, e não `?variant=thumb`, por duas razões práticas: o cache do
  /// navegador e de qualquer proxy passa a distinguir os dois objetos pela URL,
  /// e fica evidente na lista de rotas que existem dois recursos com pesos
  /// muito diferentes.
  ///
  /// Continua sendo mídia PROTEGIDA: mesma checagem de vínculo com a obra,
  /// mesmo 404 indistinguível para quem não tem acesso. Não há bucket público
  /// nem rota aberta.
  ///
  /// Foto sem miniatura gravada cai no original — é o que permite a coluna ter
  /// nascido sem backfill.
  @Get(':mediaId/miniatura')
  async serveThumbnail(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType } = await this.media.openStream(companyId, userId, reportId, mediaId, {
      variant: 'thumb',
    });

    res.type(mimeType);
    this.applySafetyHeaders(res);
    // A miniatura é imutável depois de gravada. Uma hora de cache PRIVADO
    // poupa a maior parte das idas ao servidor ao reabrir o mesmo RDO.
    res.setHeader('Cache-Control', 'private, max-age=3600');

    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get(':mediaId/arquivo')
  async serve(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Headers('range') rangeHeader: string | undefined,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ) {
    // A autorização acontece ANTES de qualquer conta sobre o Range: quem não
    // tem vínculo com a obra recebe 404 aqui, com ou sem header.
    const { mimeType, sizeBytes } = await this.media.openStream(
      companyId,
      userId,
      reportId,
      mediaId,
    );

    const pedido = parseRange(rangeHeader, sizeBytes);
    if (pedido.kind === 'unsatisfiable') {
      // 416 com o tamanho real: é assim que o player descobre onde o arquivo
      // termina, em vez de continuar pedindo faixas que não existem.
      res.status(416).setHeader('Content-Range', `bytes */${sizeBytes}`);
      res.end();
      return;
    }

    const range = pedido.kind === 'range' ? pedido.range : undefined;
    const { stream } = await this.media.openStream(companyId, userId, reportId, mediaId, {
      range,
    });

    // Anunciado SEMPRE, inclusive na resposta inteira: é por este header que o
    // player descobre que pode pedir faixas em vez de baixar tudo.
    res.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${sizeBytes}`);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
    } else if (sizeBytes > 0) {
      res.setHeader('Content-Length', String(sizeBytes));
    }

    // O Content-Type vem do tipo DETECTADO na hora do upload e gravado no
    // banco — nunca do que o cliente declarou, nem do que o navegador adivinhe.
    res.type(mimeType);
    this.applySafetyHeaders(res);
    // `private`: mídia autenticada não pode ser guardada por cache
    // compartilhado — só pelo navegador de quem a pediu.
    res.setHeader('Cache-Control', 'private, max-age=300');

    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /// Mesmos headers do `FilesController`: a CSP global está desligada (a API só
  /// responde JSON/arquivo), e estas respostas são a única coisa que um
  /// navegador pode tentar interpretar — e vêm da MESMA origem do SPA.
  /// `default-src 'none'; sandbox` neutraliza qualquer script que tenha
  /// escapado do filtro; `nosniff` impede o navegador de ignorar o
  /// Content-Type escolhido e adivinhar outro pelo conteúdo.
  ///
  /// Sem `Content-Disposition: attachment`, ao contrário dos anexos genéricos:
  /// a foto é renderizada num `<img>` e o vídeo num `<video>`, e aqui a lista
  /// de formatos é fechada — nenhum deles executa script.
  private applySafetyHeaders(res: Response): void {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
