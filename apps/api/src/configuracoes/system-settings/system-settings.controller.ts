import { Body, Controller, Get, Patch } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

@Controller('system-settings')
@RequirePermissions('admin.manage_users')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  getOrCreate(@CurrentUser('companyId') companyId: string) {
    return this.systemSettingsService.getOrCreate(companyId);
  }

  @Patch()
  update(@Body() dto: UpdateSystemSettingsDto, @CurrentUser('companyId') companyId: string) {
    return this.systemSettingsService.update(companyId, dto);
  }
}
