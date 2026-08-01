import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RhPipelineService } from './rh-pipeline.service';

@Controller('workflow/rh')
@RequirePermissions('rh.view')
export class RhPipelineController {
  constructor(private readonly rhPipelineService: RhPipelineService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser('companyId') companyId: string) {
    return this.rhPipelineService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.rhPipelineService.findOne(companyId, id);
  }
}
