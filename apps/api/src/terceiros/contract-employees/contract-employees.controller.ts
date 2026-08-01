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
import { ContractEmployeesService } from './contract-employees.service';
import { CreateContractEmployeeDto } from './dto/create-contract-employee.dto';
import { QueryContractEmployeeDto } from './dto/query-contract-employee.dto';
import { UpdateContractEmployeeDto } from './dto/update-contract-employee.dto';

@Controller('contract-employees')
export class ContractEmployeesController {
  constructor(private readonly contractEmployeesService: ContractEmployeesService) {}

  @RequirePermissions('terceiros.view')
  @Get()
  findAll(@Query() query: QueryContractEmployeeDto, @CurrentUser('companyId') companyId: string) {
    return this.contractEmployeesService.findAll(companyId, query);
  }

  @RequirePermissions('terceiros.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractEmployeesService.findOne(companyId, id);
  }

  @RequirePermissions('terceiros.manage')
  @Post()
  create(@Body() dto: CreateContractEmployeeDto, @CurrentUser('companyId') companyId: string) {
    return this.contractEmployeesService.create(companyId, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractEmployeeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.contractEmployeesService.update(companyId, id, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractEmployeesService.remove(companyId, id);
  }
}
