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
import { CreateProductionEntryDto } from './dto/create-production-entry.dto';
import { QueryProductionEntryDto } from './dto/query-production-entry.dto';
import { UpdateProductionEntryDto } from './dto/update-production-entry.dto';
import { ProductionEntriesService } from './production-entries.service';

@Controller('production-entries')
@RequirePermissions('rh.view')
export class ProductionEntriesController {
  constructor(private readonly productionEntriesService: ProductionEntriesService) {}

  @Get()
  findAll(@Query() query: QueryProductionEntryDto, @CurrentUser('companyId') companyId: string) {
    return this.productionEntriesService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.productionEntriesService.findOne(companyId, id);
  }

  @RequirePermissions('rh.manage')
  @Post()
  create(@Body() dto: CreateProductionEntryDto, @CurrentUser('companyId') companyId: string) {
    return this.productionEntriesService.create(companyId, dto);
  }

  @RequirePermissions('rh.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionEntryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.productionEntriesService.update(companyId, id, dto);
  }

  @RequirePermissions('rh.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.productionEntriesService.remove(companyId, id);
  }
}
