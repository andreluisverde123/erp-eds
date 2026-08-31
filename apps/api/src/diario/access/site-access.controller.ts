import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { ReplaceSiteAccessDto } from './dto/replace-site-access.dto';
import { SiteAccessAdminService } from './site-access-admin.service';

/// Distribuição de obras — quem entra em qual obra no Diário.
///
/// Permissão PRÓPRIA (`diario.manage_access`), e não `admin.manage_users`:
/// quem sabe qual engenheiro toca qual obra é a coordenação de engenharia, e
/// dar-lhe `admin.manage_users` só para isso entregaria junto a criação de
/// usuários e a troca de perfil de todo mundo.
///
/// Note que este controller NÃO exige `diario.access`: distribuir obras é
/// trabalho de escritório e não pressupõe estar em campo.
@RequirePermissions('diario.manage_access')
@Controller('diario/acessos')
export class SiteAccessController {
  constructor(private readonly siteAccessAdmin: SiteAccessAdminService) {}

  /// Usuários que PODEM ser vinculados (têm papel com `diario.access`).
  @Get('candidatos')
  listCandidates(@CurrentUser('companyId') companyId: string) {
    return this.siteAccessAdmin.listCandidates(companyId);
  }

  @Get('obras/:siteId')
  listBySite(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.siteAccessAdmin.listBySite(companyId, siteId);
  }

  @Put('obras/:siteId')
  replaceForSite(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: ReplaceSiteAccessDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.siteAccessAdmin.replaceForSite(companyId, siteId, dto, actorId);
  }
}
