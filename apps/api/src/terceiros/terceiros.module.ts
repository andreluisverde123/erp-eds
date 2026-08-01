import { Module } from '@nestjs/common';

import { ContractDocumentsController } from './contract-documents/contract-documents.controller';
import { ContractDocumentsService } from './contract-documents/contract-documents.service';
import { ContractEmployeesController } from './contract-employees/contract-employees.controller';
import { ContractEmployeesService } from './contract-employees/contract-employees.service';
import { ContractorsController } from './contractors/contractors.controller';
import { ContractorsService } from './contractors/contractors.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';

@Module({
  controllers: [
    ContractorsController,
    ContractsController,
    ContractDocumentsController,
    ContractEmployeesController,
  ],
  providers: [
    ContractorsService,
    ContractsService,
    ContractDocumentsService,
    ContractEmployeesService,
  ],
})
export class TerceirosModule {}
