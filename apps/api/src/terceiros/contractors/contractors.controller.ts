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
import { ContractorsService } from './contractors.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { QueryContractorDto } from './dto/query-contractor.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractorsService: ContractorsService) {}

  // Leitura liberada a qualquer usuário autenticado — outros módulos (ex.:
  // Financeiro, se vier a existir uma conta a pagar de terceiro) podem
  // precisar listar empresas terceirizadas sem ter `engenharia.access`.
  @RequirePermissions('terceiros.view')
  @Get()
  findAll(@Query() query: QueryContractorDto, @CurrentUser('companyId') companyId: string) {
    return this.contractorsService.findAll(companyId, query);
  }

  @RequirePermissions('terceiros.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractorsService.findOne(companyId, id);
  }

  @RequirePermissions('terceiros.manage')
  @Post()
  create(@Body() dto: CreateContractorDto, @CurrentUser('companyId') companyId: string) {
    return this.contractorsService.create(companyId, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractorDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.contractorsService.update(companyId, id, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractorsService.remove(companyId, id);
  }
}
