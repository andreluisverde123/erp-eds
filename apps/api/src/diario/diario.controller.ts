import { Controller, Get } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { DailyReportsService } from './reports/daily-reports.service';
import { DiarioSitesService } from './sites/diario-sites.service';

/// Quantos RDOs a Home mostra. Prévia, não listagem: o suficiente para caber
/// numa tela de celular sem rolagem própria.
const RECENT_REPORTS_LIMIT = 5;

/// Rotas do ambiente do Diário de Obras.
///
/// `@RequirePermissions('diario.access')` está em TODOS os controllers do
/// módulo, no nível da classe. É a primeira metade da cadeia de acesso
/// (usuário → permissão); a segunda (vínculo → obras → RDOs) é o
/// `SiteAccessService`, e nenhuma rota daqui lê obra ou relatório sem passar
/// por ele.
@RequirePermissions('diario.access')
@Controller('diario')
export class DiarioController {
  constructor(
    private readonly sites: DiarioSitesService,
    private readonly reports: DailyReportsService,
  ) {}

  /// Tudo que a Home precisa, numa requisição só. Três chamadas separadas
  /// seriam mais "REST", e mais três handshakes numa conexão de canteiro de
  /// obra — a tela inteira depende das mesmas obras vinculadas, então elas
  /// são resolvidas uma vez e reaproveitadas.
  @Get('home')
  async home(@CurrentUser('companyId') companyId: string, @CurrentUser('sub') userId: string) {
    const sites = await this.sites.findAll(companyId, userId);
    const recentReports = await this.reports.findRecent(
      companyId,
      userId,
      sites.map((site) => site.id),
      RECENT_REPORTS_LIMIT,
    );

    return { sites, recentReports };
  }
}
