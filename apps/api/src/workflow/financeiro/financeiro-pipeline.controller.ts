import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FinanceiroPipelineService } from './financeiro-pipeline.service';

@Controller('workflow/financeiro')
@RequirePermissions('financeiro.view')
export class FinanceiroPipelineController {
  constructor(private readonly financeiroPipelineService: FinanceiroPipelineService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser('companyId') companyId: string) {
    return this.financeiroPipelineService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.financeiroPipelineService.findOne(companyId, id);
  }
}
