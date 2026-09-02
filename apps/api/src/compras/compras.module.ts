import { Module } from '@nestjs/common';

import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { PurchaseRequestsController } from './purchase-requests/purchase-requests.controller';
import { ItemSuggestionsService } from './purchase-requests/item-suggestions.service';
import { PurchaseRequestsService } from './purchase-requests/purchase-requests.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { FulfillmentService } from './fulfillment.service';

@Module({
  controllers: [SuppliersController, PurchaseRequestsController, PurchaseOrdersController],
  providers: [
    SuppliersService,
    PurchaseRequestsService,
    ItemSuggestionsService,
    PurchaseOrdersService,
    /// Compartilhado pelos dois lados: a solicitação mostra o saldo, a ordem
    /// de compra o consome. Uma cópia em cada um divergiria na primeira
    /// mudança de regra.
    FulfillmentService,
  ],
})
export class ComprasModule {}
