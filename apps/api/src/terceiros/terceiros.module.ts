import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { ContractDocumentsController } from './contract-documents/contract-documents.controller';
import { ContractDocumentsService } from './contract-documents/contract-documents.service';
import { ContractEmployeesController } from './contract-employees/contract-employees.controller';
import { ContractEmployeesService } from './contract-employees/contract-employees.service';
import { ContractorsController } from './contractors/contractors.controller';
import { ContractorsService } from './contractors/contractors.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { ServiceInvoicesController } from './service-invoices/service-invoices.controller';
import { ServiceInvoicesService } from './service-invoices/service-invoices.service';

@Module({
  imports: [AttachmentsModule],
  controllers: [
    ContractorsController,
    ContractsController,
    ContractDocumentsController,
    ContractEmployeesController,
    ServiceInvoicesController,
  ],
  providers: [
    ContractorsService,
    ContractsService,
    ContractDocumentsService,
    ContractEmployeesService,
    ServiceInvoicesService,
  ],
})
export class TerceirosModule {}
