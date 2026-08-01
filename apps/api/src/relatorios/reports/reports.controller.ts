import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { QueryReportDto } from './dto/query-report.dto';
import { streamExcel, streamPdf } from './export.util';
import { ReportsService, type ReportType } from './reports.service';

const VALID_TYPES: ReportType[] = ['obras', 'compras', 'financeiro', 'rh', 'terceiros'];

function assertValidType(type: string): asserts type is ReportType {
  if (!VALID_TYPES.includes(type as ReportType)) {
    throw new BadRequestException(`Relatório "${type}" desconhecido.`);
  }
}

@Controller('relatorios/reports')
@RequirePermissions('relatorios.view')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':type')
  findByType(
    @Param('type') type: string,
    @Query() query: QueryReportDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    assertValidType(type);
    return this.reportsService.findByType(type, companyId, query);
  }

  @Get(':type/export')
  async exportByType(
    @Param('type') type: string,
    @Query() query: QueryReportDto,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    assertValidType(type);
    const payload = await this.reportsService.exportByType(type, companyId, query);

    if (query.format === 'pdf') {
      streamPdf(res, `relatorio-${type}`, payload.title, payload.columns, payload.rows);
      return;
    }

    await streamExcel(res, `relatorio-${type}`, payload.columns, payload.rows);
  }
}
