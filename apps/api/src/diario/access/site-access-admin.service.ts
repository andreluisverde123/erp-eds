import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReplaceSiteAccessDto } from './dto/replace-site-access.dto';

export interface SiteAccessEntry {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  role: 'ENGINEER' | 'INSPECTOR';
}

const DIARIO_ACCESS_PERMISSION = 'diario.access';

/// Gestão de "quem entra em qual obra". Vive atrás de `diario.manage_access`,
/// separada da leitura do Diário: quem distribui obras não precisa estar
/// vinculado a nenhuma, e quem está vinculado a uma obra não pode se
/// adicionar em outra.
@Injectable()
export class SiteAccessAdminService {
  private readonly logger = new Logger(SiteAccessAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /// A equipe atual de uma obra.
  async listBySite(companyId: string, siteId: string): Promise<SiteAccessEntry[]> {
    await this.assertSiteExists(companyId, siteId);

    const links = await this.prisma.userConstructionSite.findMany({
      where: { constructionSiteId: siteId },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return links.map((link) => ({
      userId: link.user.id,
      name: link.user.name,
      email: link.user.email,
      isActive: link.user.isActive,
      role: link.role,
    }));
  }

  /// Candidatos a serem vinculados: os usuários da empresa cujo papel dá
  /// `diario.access`. Vincular alguém sem a permissão é permitido pelo banco,
  /// mas produziria um vínculo inútil — a pessoa nem entraria no Diário —, e
  /// é o tipo de configuração que ninguém consegue depurar pela tela.
  async listCandidates(companyId: string): Promise<{ id: string; name: string; email: string }[]> {
    return this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: {
            role: {
              deletedAt: null,
              rolePermissions: { some: { permission: { code: DIARIO_ACCESS_PERMISSION } } },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  /// Substitui a equipe da obra inteira. Numa transação: um erro no meio não
  /// pode deixar a obra sem ninguém.
  async replaceForSite(
    companyId: string,
    siteId: string,
    dto: ReplaceSiteAccessDto,
    actorId: string,
  ): Promise<SiteAccessEntry[]> {
    await this.assertSiteExists(companyId, siteId);

    const userIds = dto.entries.map((entry) => entry.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException('O mesmo usuário aparece mais de uma vez na lista.');
    }

    // Confere que TODO usuário informado pertence à empresa de quem está
    // editando. Sem isto, um id de usuário de outro inquilino, colado no
    // corpo da requisição, criaria um vínculo válido para o banco e visível
    // para o outro lado — vazamento entre empresas pela porta dos fundos.
    if (userIds.length > 0) {
      const found = await this.prisma.user.count({
        where: { id: { in: userIds }, companyId, deletedAt: null },
      });
      if (found !== userIds.length) {
        throw new BadRequestException('Um ou mais usuários informados não existem nesta empresa.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userConstructionSite.deleteMany({ where: { constructionSiteId: siteId } }),
      ...dto.entries.map((entry) =>
        this.prisma.userConstructionSite.create({
          data: { constructionSiteId: siteId, userId: entry.userId, role: entry.role },
        }),
      ),
    ]);

    // Quem pode ver o quê é exatamente o tipo de mudança que precisa deixar
    // rastro: sem isto, "por que este usuário viu esta obra em março?" não
    // teria resposta.
    await this.auditLogger.log({
      companyId,
      userId: actorId,
      action: 'UPDATE',
      entityType: 'UserConstructionSite',
      entityId: siteId,
      changes: { entries: dto.entries.map((entry) => ({ ...entry })) },
    });

    this.logger.log(
      `Acessos do Diário atualizados na obra ${siteId}: ${dto.entries.length} usuário(s), por ${actorId}.`,
    );

    return this.listBySite(companyId, siteId);
  }

  private async assertSiteExists(companyId: string, siteId: string): Promise<void> {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id: siteId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!site) {
      throw new NotFoundException('Obra não encontrada.');
    }
  }
}
