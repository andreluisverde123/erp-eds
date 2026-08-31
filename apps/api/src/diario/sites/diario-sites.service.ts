import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SiteAccessService, type DiarioSite } from '../access/site-access.service';

export interface DiarioSiteListItem extends DiarioSite {
  /// Em que papel a pessoa participa DESTA obra (ver `SiteAssignmentRole`).
  assignmentRole: 'ENGINEER' | 'INSPECTOR';
  /// Data do RDO mais recente da obra, ou `null` se nenhum foi feito ainda.
  /// A Home mostra isso porque é a informação que responde à pergunta que o
  /// engenheiro faz ao abrir o app — "esta obra está em dia?".
  lastReportDate: Date | null;
  reportCount: number;
}

@Injectable()
export class DiarioSitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteAccess: SiteAccessService,
  ) {}

  async findAll(companyId: string, userId: string): Promise<DiarioSiteListItem[]> {
    const sites = await this.siteAccess.listAccessibleSites(companyId, userId);
    if (sites.length === 0) return [];

    return this.withReportSummary(sites);
  }

  async findOne(companyId: string, userId: string, siteId: string): Promise<DiarioSiteListItem> {
    // Uma consulta só resolve as duas perguntas: a obra existe E é sua.
    const site = await this.siteAccess.assertSiteAccess(companyId, userId, siteId);
    const link = await this.prisma.userConstructionSite.findUniqueOrThrow({
      where: { userId_constructionSiteId: { userId, constructionSiteId: siteId } },
      select: { role: true },
    });

    const [enriched] = await this.withReportSummary([{ ...site, assignmentRole: link.role }]);
    // `withReportSummary` devolve um item por obra recebida, e recebeu uma.
    return enriched!;
  }

  /// Último RDO e contagem por obra, em DUAS consultas agregadas em vez de
  /// duas por obra. Com dez obras vinculadas a diferença é imperceptível; o
  /// motivo de fazer assim é que a Home abre em 4G, no canteiro, e o custo de
  /// um N+1 aqui cresce com a carreira do engenheiro.
  private async withReportSummary(
    sites: (DiarioSite & { assignmentRole: 'ENGINEER' | 'INSPECTOR' })[],
  ): Promise<DiarioSiteListItem[]> {
    const siteIds = sites.map((site) => site.id);

    const summary = await this.prisma.dailyReport.groupBy({
      by: ['constructionSiteId'],
      where: { constructionSiteId: { in: siteIds }, deletedAt: null },
      _max: { reportDate: true },
      _count: { _all: true },
    });

    const byId = new Map(summary.map((row) => [row.constructionSiteId, row]));

    return sites.map((site) => ({
      ...site,
      lastReportDate: byId.get(site.id)?._max.reportDate ?? null,
      reportCount: byId.get(site.id)?._count._all ?? 0,
    }));
  }
}
