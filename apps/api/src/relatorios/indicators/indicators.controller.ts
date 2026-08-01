import { Controller, Get } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { IndicatorsService } from './indicators.service';

@Controller('relatorios/indicators')
@RequirePermissions('relatorios.view')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get('compras')
  getCompras(@CurrentUser('companyId') companyId: string) {
    return this.indicatorsService.getComprasIndicators(companyId);
  }

  @Get('financeiro')
  getFinanceiro(@CurrentUser('companyId') companyId: string) {
    return this.indicatorsService.getFinanceiroIndicators(companyId);
  }

  @Get('engenharia')
  getEngenharia(@CurrentUser('companyId') companyId: string) {
    return this.indicatorsService.getEngenhariaIndicators(companyId);
  }

  @Get('rh')
  getRh(@CurrentUser('companyId') companyId: string) {
    return this.indicatorsService.getRhIndicators(companyId);
  }

  @Get('terceiros')
  getTerceiros(@CurrentUser('companyId') companyId: string) {
    return this.indicatorsService.getTerceirosIndicators(companyId);
  }
}
