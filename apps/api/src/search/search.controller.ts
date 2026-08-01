import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { QuerySearchDto } from './dto/query-search.dto';
import { SearchService } from './search.service';

@Controller('search')
@RequirePermissions('dashboard.view')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() query: QuerySearchDto, @CurrentUser('companyId') companyId: string) {
    return this.searchService.search(companyId, query.q);
  }
}
