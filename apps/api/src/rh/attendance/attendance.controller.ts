import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { AttendanceService } from './attendance.service';
import { QueryAttendanceDayDto } from './dto/query-attendance-day.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { SaveAttendanceDayDto } from './dto/save-attendance-day.dto';

/// Presença individual: quem efetivamente trabalhou numa obra num dia.
///
/// Mesmas permissões do resto do RH — `rh.view` para ler, `rh.manage` para
/// apontar e corrigir. Nenhuma permissão nova: apontar presença é operação de
/// RH, não um módulo à parte.
@Controller('attendance')
@RequirePermissions('rh.view')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /// A chamada de uma obra num dia: quem estava alocado e o que já foi
  /// apontado sobre cada um.
  @Get('day')
  day(@Query() query: QueryAttendanceDayDto, @CurrentUser('companyId') companyId: string) {
    return this.attendanceService.day(companyId, query);
  }

  /// Dias trabalhados no período. Contagem, sem nenhum valor.
  @Get('summary')
  summary(@Query() query: QueryAttendanceDto, @CurrentUser('companyId') companyId: string) {
    return this.attendanceService.summary(companyId, query);
  }

  @Get()
  findAll(@Query() query: QueryAttendanceDto, @CurrentUser('companyId') companyId: string) {
    return this.attendanceService.findAll(companyId, query);
  }

  /// `PUT`, e não `POST`: o pedido descreve o ESTADO do dia, e enviá-lo duas
  /// vezes deixa o sistema igual. É a mesma idempotência que o `upsert` garante
  /// no banco, dita no verbo.
  @RequirePermissions('rh.manage')
  @Put('day')
  saveDay(@Body() dto: SaveAttendanceDayDto, @CurrentUser('companyId') companyId: string) {
    return this.attendanceService.saveDay(companyId, dto);
  }
}
