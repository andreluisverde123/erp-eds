import { Controller, ForbiddenException, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { requiredPermissionForEntity } from '../configuracoes/audit-logs/entity-permissions.constant';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.module';

/// Nome de arquivo sempre gerado pelo backend via `randomUUID() + extname(...)`
/// no upload (nunca o nome original do cliente) — qualquer coisa fora desse
/// formato é rejeitada antes de virar chave de storage, pra nunca dar chance
/// de path traversal via segmento de URL codificado.
const SAFE_FILENAME = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/;
const SAFE_ENTITY_TYPE = /^[a-zA-Z]+$/;

/// Substitui `app.useStaticAssets()` (servia `/uploads` inteiro publicamente,
/// sem passar pelos guards do Nest). Toda leitura de arquivo aqui exige JWT
/// válido (guard global) + mesma empresa do dono do arquivo + permissão do
/// módulo dono do registro — mesma regra já usada pra ver o registro em si.
///
/// O conteúdo vem do `StorageService`, então funciona igual com os arquivos em
/// disco ou num bucket S3 — e continua passando por aqui em vez de virar URL
/// assinada, que escaparia dessas checagens.
@Controller('uploads')
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('logos/:filename')
  async serveLogo(
    @Param('filename') filename: string,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    if (!SAFE_FILENAME.test(filename)) throw new NotFoundException();

    const fileUrl = `/uploads/logos/${filename}`;
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, logoUrl: fileUrl },
      select: { id: true },
    });
    if (!company) throw new NotFoundException();

    return this.stream(`logos/${filename}`, res);
  }

  @Get('payslips/:filename')
  servePayslip(
    @Param('filename') filename: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    return this.serveAttachment('payslips', filename, user, res);
  }

  @Get('contract-documents/:filename')
  serveContractDocument(
    @Param('filename') filename: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    return this.serveAttachment('contract-documents', filename, user, res);
  }

  /// Anexos genéricos de registro (obra, solicitação, pagamento…), gravados
  /// pelo módulo `attachments` em `entities/<Modelo>/<uuid>.<ext>`.
  @Get('entities/:entityType/:filename')
  serveEntityAttachment(
    @Param('entityType') entityType: string,
    @Param('filename') filename: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    if (!SAFE_ENTITY_TYPE.test(entityType)) throw new NotFoundException();
    return this.serveAttachment(`entities/${entityType}`, filename, user, res);
  }

  @Get('workflow/:entityType/:filename')
  serveWorkflowAttachment(
    @Param('entityType') entityType: string,
    @Param('filename') filename: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    if (!SAFE_ENTITY_TYPE.test(entityType)) throw new NotFoundException();
    return this.serveAttachment(`workflow/${entityType}`, filename, user, res);
  }

  private async serveAttachment(dir: string, filename: string, user: JwtPayload, res: Response) {
    if (!SAFE_FILENAME.test(filename)) throw new NotFoundException();

    const fileUrl = `/uploads/${dir}/${filename}`;
    const attachment = await this.prisma.attachment.findFirst({
      where: { fileUrl, deletedAt: null },
    });

    if (!attachment || attachment.companyId !== user.companyId) {
      throw new NotFoundException();
    }

    const requiredPermission = requiredPermissionForEntity(attachment.entityType);
    if (!requiredPermission || !user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException('Você não tem permissão para acessar este arquivo.');
    }

    if (attachment.mimeType) res.type(attachment.mimeType);
    return this.stream(`${dir}/${filename}`, res);
  }

  private async stream(key: string, res: Response) {
    const stream = await this.storage.getStream(key);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
