import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateEmployeeAllocationDto } from './dto/create-employee-allocation.dto';
import { QueryEmployeeAllocationDto } from './dto/query-employee-allocation.dto';
import { UpdateEmployeeAllocationDto } from './dto/update-employee-allocation.dto';
import { EmployeeAllocationsService } from './employee-allocations.service';

@Controller('employee-allocations')
@RequirePermissions('rh.view')
export class EmployeeAllocationsController {
  constructor(private readonly employeeAllocationsService: EmployeeAllocationsService) {}

  @Get()
  findAll(@Query() query: QueryEmployeeAllocationDto, @CurrentUser('companyId') companyId: string) {
    return this.employeeAllocationsService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.employeeAllocationsService.findOne(companyId, id);
  }

  @RequirePermissions('rh.manage')
  @Post()
  create(@Body() dto: CreateEmployeeAllocationDto, @CurrentUser('companyId') companyId: string) {
    return this.employeeAllocationsService.create(companyId, dto);
  }

  @RequirePermissions('rh.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeAllocationDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.employeeAllocationsService.update(companyId, id, dto);
  }

  @RequirePermissions('rh.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.employeeAllocationsService.remove(companyId, id);
  }
}
