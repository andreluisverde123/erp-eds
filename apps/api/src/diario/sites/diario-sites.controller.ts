import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { DiarioSitesService } from './diario-sites.service';

/// As obras do Diário são as MESMAS obras do ERP (`ConstructionSite`) — não
/// há tabela paralela. Este controller existe separado de
/// `ConstructionSitesController` porque a pergunta é outra: lá é "as obras da
/// empresa" (permissão `engenharia.view`), aqui é "as obras desta pessoa"
/// (permissão `diario.access` + vínculo). Reaproveitar o endpoint do ERP
/// significaria enfiar o recorte por usuário dentro de uma rota que hoje
/// devolve tudo — e um esquecimento ali vazaria obra para o Diário.
@RequirePermissions('diario.access')
@Controller('diario/obras')
export class DiarioSitesController {
  constructor(private readonly sites: DiarioSitesService) {}

  @Get()
  findAll(@CurrentUser('companyId') companyId: string, @CurrentUser('sub') userId: string) {
    return this.sites.findAll(companyId, userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.sites.findOne(companyId, userId, id);
  }
}
