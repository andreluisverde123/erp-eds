import { Body, Controller, Get, Param, Patch } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@Controller('notification-preferences')
@RequirePermissions('admin.manage_users')
export class NotificationPreferencesController {
  constructor(private readonly notificationPreferencesService: NotificationPreferencesService) {}

  @Get()
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.notificationPreferencesService.findAll(companyId);
  }

  @Patch(':eventKey')
  update(
    @Param('eventKey') eventKey: string,
    @Body() dto: UpdateNotificationPreferenceDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.notificationPreferencesService.update(companyId, eventKey, dto);
  }
}
