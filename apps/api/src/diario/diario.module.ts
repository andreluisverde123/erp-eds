import { Module } from '@nestjs/common';

import { SiteAccessAdminService } from './access/site-access-admin.service';
import { SiteAccessController } from './access/site-access.controller';
import { SiteAccessService } from './access/site-access.service';
import { DiarioController } from './diario.controller';
import { DailyReportsController } from './reports/daily-reports.controller';
import { DailyReportsService } from './reports/daily-reports.service';
import { RdoPdfService } from './reports/pdf/rdo-pdf.service';
import { DailyReportItemsController } from './reports/items/daily-report-items.controller';
import { DailyReportItemsService } from './reports/items/daily-report-items.service';
import { DailyReportMediaController } from './reports/media/daily-report-media.controller';
import { DailyReportMediaService } from './reports/media/daily-report-media.service';
import { DiarioSitesController } from './sites/diario-sites.controller';
import { DiarioSitesService } from './sites/diario-sites.service';

/// Diário de Obras.
///
/// Módulo NOVO, mas nenhuma infraestrutura nova: usa o mesmo Prisma, a mesma
/// autenticação (JWT + refresh cookie do `AuthModule`), o mesmo catálogo de
/// permissões e as MESMAS obras (`ConstructionSite`) do resto do ERP. O que
/// ele acrescenta é o recorte por vínculo usuário↔obra, que não existia.
///
/// `SiteAccessService` é exportado porque as etapas seguintes do Diário
/// (criação de RDO, fotos, assinaturas) precisam da mesma verificação de
/// acesso — e ela tem que continuar existindo em um lugar só.
@Module({
  controllers: [
    DiarioController,
    DiarioSitesController,
    DailyReportsController,
    DailyReportItemsController,
    DailyReportMediaController,
    SiteAccessController,
  ],
  providers: [
    SiteAccessService,
    DiarioSitesService,
    DailyReportsService,
    RdoPdfService,
    DailyReportItemsService,
    DailyReportMediaService,
    SiteAccessAdminService,
  ],
  exports: [SiteAccessService],
})
export class DiarioModule {}
