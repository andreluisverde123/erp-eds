import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ComprasPipelineService } from './compras-pipeline.service';

@Controller('workflow/compras')
@RequirePermissions('compras.view')
export class ComprasPipelineController {
  constructor(private readonly comprasPipelineService: ComprasPipelineService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser('companyId') companyId: string) {
    return this.comprasPipelineService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.comprasPipelineService.findOne(companyId, id);
  }
}
