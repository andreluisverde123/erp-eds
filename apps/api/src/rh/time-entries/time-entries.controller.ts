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
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { QueryTimeEntryDto } from './dto/query-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeEntriesService } from './time-entries.service';

@Controller('time-entries')
@RequirePermissions('rh.view')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  findAll(@Query() query: QueryTimeEntryDto, @CurrentUser('companyId') companyId: string) {
    return this.timeEntriesService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.timeEntriesService.findOne(companyId, id);
  }

  @RequirePermissions('rh.manage')
  @Post()
  create(@Body() dto: CreateTimeEntryDto, @CurrentUser('companyId') companyId: string) {
    return this.timeEntriesService.create(companyId, dto);
  }

  @RequirePermissions('rh.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.timeEntriesService.update(companyId, id, dto);
  }

  @RequirePermissions('rh.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.timeEntriesService.remove(companyId, id);
  }
}
