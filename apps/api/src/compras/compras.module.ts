import { Module } from '@nestjs/common';

import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { PurchaseRequestsController } from './purchase-requests/purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests/purchase-requests.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';

@Module({
  controllers: [SuppliersController, PurchaseRequestsController, PurchaseOrdersController],
  providers: [SuppliersService, PurchaseRequestsService, PurchaseOrdersService],
})
export class ComprasModule {}
