import { Body, Controller, Post } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateWorkflowEventDto } from './dto/create-workflow-event.dto';
import { WorkflowEventsService } from './workflow-events.service';

@Controller('workflow/events')
@RequirePermissions('dashboard.view')
export class WorkflowEventsController {
  constructor(private readonly workflowEventsService: WorkflowEventsService) {}

  @Post()
  create(@Body() dto: CreateWorkflowEventDto, @CurrentUser() user: JwtPayload) {
    return this.workflowEventsService.create(user.companyId, user.sub, user.permissions, dto);
  }
}
