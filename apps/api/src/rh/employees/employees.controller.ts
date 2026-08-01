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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@RequirePermissions('rh.view')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll(@Query() query: QueryEmployeeDto, @CurrentUser('companyId') companyId: string) {
    return this.employeesService.findAll(companyId, query);
  }

  // Precisa vir antes de ":id" — senão "positions" seria interpretado como um id.
  @Get('positions')
  positions(@CurrentUser('companyId') companyId: string) {
    return this.employeesService.positions(companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.employeesService.findOne(companyId, id);
  }

  @RequirePermissions('rh.manage')
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser('companyId') companyId: string) {
    return this.employeesService.create(companyId, dto);
  }

  @RequirePermissions('rh.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.employeesService.update(companyId, id, dto);
  }

  @RequirePermissions('rh.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.employeesService.remove(companyId, id);
  }
}
