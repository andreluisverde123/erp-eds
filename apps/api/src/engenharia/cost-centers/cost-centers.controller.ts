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
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { QueryCostCenterDto } from './dto/query-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Controller('cost-centers')
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  // Mesmo raciocínio do ConstructionSitesController: leitura liberada a
  // qualquer usuário autenticado, escrita restrita à Engenharia.
  @RequirePermissions('engenharia.view')
  @Get()
  findAll(@Query() query: QueryCostCenterDto, @CurrentUser('companyId') companyId: string) {
    return this.costCentersService.findAll(companyId, query);
  }

  @RequirePermissions('engenharia.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.costCentersService.findOne(companyId, id);
  }

  @RequirePermissions('engenharia.manage')
  @Post()
  create(@Body() dto: CreateCostCenterDto, @CurrentUser('companyId') companyId: string) {
    return this.costCentersService.create(companyId, dto);
  }

  @RequirePermissions('engenharia.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCostCenterDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.costCentersService.update(companyId, id, dto);
  }

  @RequirePermissions('engenharia.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.costCentersService.remove(companyId, id);
  }
}
