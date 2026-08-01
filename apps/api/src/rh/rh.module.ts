import { Module } from '@nestjs/common';

import { EmployeeAllocationsController } from './employee-allocations/employee-allocations.controller';
import { EmployeeAllocationsService } from './employee-allocations/employee-allocations.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { PayslipsController } from './payslips/payslips.controller';
import { PayslipsService } from './payslips/payslips.service';
import { ProductionEntriesController } from './production-entries/production-entries.controller';
import { ProductionEntriesService } from './production-entries/production-entries.service';
import { TimeEntriesController } from './time-entries/time-entries.controller';
import { TimeEntriesService } from './time-entries/time-entries.service';

@Module({
  controllers: [
    EmployeesController,
    EmployeeAllocationsController,
    TimeEntriesController,
    ProductionEntriesController,
    PayslipsController,
  ],
  providers: [
    EmployeesService,
    EmployeeAllocationsService,
    TimeEntriesService,
    ProductionEntriesService,
    PayslipsService,
  ],
})
export class RhModule {}
