import { Module } from '@nestjs/common';

import { CatalogItemsController } from './catalog-items/catalog-items.controller';
import { CatalogItemsService } from './catalog-items/catalog-items.service';
import { ConstructionSitesController } from './construction-sites/construction-sites.controller';
import { ConstructionSitesService } from './construction-sites/construction-sites.service';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { CostCentersService } from './cost-centers/cost-centers.service';

@Module({
  controllers: [ConstructionSitesController, CostCentersController, CatalogItemsController],
  providers: [ConstructionSitesService, CostCentersService, CatalogItemsService],
})
export class EngenhariaModule {}
