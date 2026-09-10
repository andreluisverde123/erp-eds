import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { EmployeeAllocationsController } from './employee-allocations/employee-allocations.controller';
import { EmployeeAllocationsService } from './employee-allocations/employee-allocations.service';
import { LaborCostsController } from './labor-costs/labor-costs.controller';
import { LaborCostsService } from './labor-costs/labor-costs.service';
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
    AttendanceController,
    LaborCostsController,
    TimeEntriesController,
    ProductionEntriesController,
    PayslipsController,
  ],
  providers: [
    EmployeesService,
    EmployeeAllocationsService,
    AttendanceService,
    LaborCostsService,
    TimeEntriesService,
    ProductionEntriesService,
    PayslipsService,
  ],
})
export class RhModule {}
