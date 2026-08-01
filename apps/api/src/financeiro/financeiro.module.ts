import { Module } from '@nestjs/common';

import { AccountPayablesController } from './account-payables/account-payables.controller';
import { AccountPayablesService } from './account-payables/account-payables.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

@Module({
  controllers: [InvoicesController, AccountPayablesController, PaymentsController],
  providers: [InvoicesService, AccountPayablesService, PaymentsService],
})
export class FinanceiroModule {}
