import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { QueryLaborCostDto } from './dto/query-labor-cost.dto';
import { LaborCostsService } from './labor-costs.service';

/// Custo de mão de obra por obra. Só leitura: este módulo APROPRIA custo, não
/// gera folha, conta a pagar nem lançamento — nada aqui escreve dinheiro.
@Controller('labor-costs')
@RequirePermissions('rh.view')
export class LaborCostsController {
  constructor(private readonly laborCostsService: LaborCostsService) {}

  @Get()
  byConstructionSite(
    @Query() query: QueryLaborCostDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.laborCostsService.byConstructionSite(companyId, query);
  }
}
