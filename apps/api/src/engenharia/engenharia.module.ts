import { Module } from '@nestjs/common';

import { BudgetTransferService } from './budgets/budget-transfer.service';
import { BudgetsController } from './budgets/budgets.controller';
import { BudgetsService } from './budgets/budgets.service';
import { CatalogItemPricesController } from './catalog-item-prices/catalog-item-prices.controller';
import { CatalogItemPricesService } from './catalog-item-prices/catalog-item-prices.service';
import { CatalogItemsController } from './catalog-items/catalog-items.controller';
import { CatalogItemsService } from './catalog-items/catalog-items.service';
import { CompositionsController } from './compositions/compositions.controller';
import { CompositionsService } from './compositions/compositions.service';
import { ConstructionSitesController } from './construction-sites/construction-sites.controller';
import { ConstructionSitesService } from './construction-sites/construction-sites.service';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { CostCentersService } from './cost-centers/cost-centers.service';
import { ReferenceDatasetsController } from './reference/reference-datasets.controller';
import { ReferenceDatasetsService } from './reference/reference-datasets.service';

@Module({
  controllers: [
    ConstructionSitesController,
    CostCentersController,
    CatalogItemsController,
    CatalogItemPricesController,
    CompositionsController,
    BudgetsController,
    ReferenceDatasetsController,
  ],
  providers: [
    ConstructionSitesService,
    CostCentersService,
    CatalogItemsService,
    CatalogItemPricesService,
    CompositionsService,
    BudgetsService,
    BudgetTransferService,
    ReferenceDatasetsService,
  ],
})
export class EngenhariaModule {}
