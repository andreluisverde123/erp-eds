import { Module } from '@nestjs/common';

import { ConstructionSitesController } from './construction-sites/construction-sites.controller';
import { ConstructionSitesService } from './construction-sites/construction-sites.service';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { CostCentersService } from './cost-centers/cost-centers.service';

@Module({
  controllers: [ConstructionSitesController, CostCentersController],
  providers: [ConstructionSitesService, CostCentersService],
})
export class EngenhariaModule {}
