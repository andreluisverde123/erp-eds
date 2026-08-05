import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { FiscalCertificateService } from './certificate/fiscal-certificate.service';
import { UploadCertificateDto } from './dto/upload-certificate.dto';
import { FiscalIntegrationService } from './fiscal-integration.service';
import { FiscalImportService } from './import/fiscal-import.service';
import { FiscalSyncService } from './sync/fiscal-sync.service';

/// Um A1 tem uns poucos KB. O teto existe para que um upload equivocado (um
/// vídeo, um dump) não seja carregado inteiro na memória antes de ser
/// recusado.
const MAX_PFX_BYTES = 512 * 1024;

/// Administração > Integração Fiscal.
///
/// Permissão própria (`admin.fiscal_integration`) e não `admin.manage_users`:
/// aquela é literalmente sobre usuários e papéis, e usá-la aqui faria com que
/// dar acesso ao cadastro de usuários entregasse junto o certificado digital
/// da empresa — que é a identidade jurídica dela.
@Controller('admin/fiscal-integration')
@RequirePermissions('admin.fiscal_integration')
export class FiscalIntegrationController {
  constructor(
    private readonly integration: FiscalIntegrationService,
    private readonly certificates: FiscalCertificateService,
    private readonly sync: FiscalSyncService,
    private readonly importer: FiscalImportService,
  ) {}

  /// Tudo que o painel exibe, numa chamada.
  @Get('status')
  status(@CurrentUser('companyId') companyId: string) {
    return this.integration.status(companyId);
  }

  @Get('runs')
  runs(@Query() query: PaginationQueryDto, @CurrentUser('companyId') companyId: string) {
    return this.integration.historico(companyId, query.page, query.limit);
  }

  /// Envio do certificado A1. O arquivo NUNCA toca o disco: `memoryStorage`
  /// mantém o buffer em memória até ser cifrado e gravado no banco — um .pfx
  /// em `/tmp` seria a identidade da empresa esperando alguém achar.
  @Post('certificate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PFX_BYTES },
    }),
  )
  uploadCertificate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadCertificateDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    if (!file) {
      throw new BadRequestException('Envie o arquivo do certificado (.pfx ou .p12).');
    }
    if (!/\.(pfx|p12)$/i.test(file.originalname)) {
      throw new BadRequestException('O arquivo precisa ser .pfx ou .p12 (certificado A1).');
    }

    return this.certificates.upload(companyId, actingUserId, ip, file.buffer, dto.password);
  }

  @Delete('certificate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCertificate(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    await this.certificates.remove(companyId, actingUserId, ip);
  }

  /// Testar Conexão. Limitado a 5/min: cada chamada abre um mTLS contra a
  /// SEFAZ, e um botão numa tela é fácil de clicar repetidamente.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('test-connection')
  testConnection(@CurrentUser('companyId') companyId: string) {
    return this.integration.testarConexao(companyId);
  }

  /// Sincronizar Agora. Também limitado: a SEFAZ bloqueia o CNPJ por 1 hora ao
  /// detectar consumo indevido, e o serviço se protege sozinho — mas segurar
  /// aqui evita gastar a viagem.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('sync')
  syncNow(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
  ) {
    return this.sync.sync(companyId, 'MANUAL', actingUserId);
  }

  /// Processa manualmente a fila de documentos baixados. O job faz isto a cada
  /// 5 minutos; o botão existe para não esperar depois de uma sincronização
  /// manual, e para reprocessar o que ficou em erro.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('import')
  importNow(@CurrentUser('companyId') companyId: string) {
    return this.importer.processPending(companyId);
  }
}
