import { Controller, Get } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('relatorios/dashboard')
@RequirePermissions('relatorios.view')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentUser('companyId') companyId: string) {
    return this.dashboardService.getSummary(companyId);
  }
}
