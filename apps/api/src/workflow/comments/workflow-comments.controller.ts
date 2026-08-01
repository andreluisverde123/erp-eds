import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateWorkflowCommentDto } from './dto/create-workflow-comment.dto';
import { QueryWorkflowCommentDto } from './dto/query-workflow-comment.dto';
import { WorkflowCommentsService } from './workflow-comments.service';

@Controller('workflow/comments')
@RequirePermissions('dashboard.view')
export class WorkflowCommentsController {
  constructor(private readonly workflowCommentsService: WorkflowCommentsService) {}

  @Get()
  findForEntity(
    @Query() query: QueryWorkflowCommentDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.workflowCommentsService.findForEntity(companyId, query.entityType, query.entityId);
  }

  @Post()
  create(@Body() dto: CreateWorkflowCommentDto, @CurrentUser() user: JwtPayload) {
    return this.workflowCommentsService.create(user.companyId, user.sub, user.permissions, dto);
  }
}
