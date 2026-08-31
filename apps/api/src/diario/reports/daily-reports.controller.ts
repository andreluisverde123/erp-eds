import {
  Body,
  Controller,
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
import { DailyReportsService } from './daily-reports.service';
import { CopyDailyReportDto } from './dto/copy-daily-report.dto';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';
import { UpdateDailyReportDto } from './dto/update-daily-report.dto';

/// Relatórios diários de obra.
///
/// Duas permissões, e não uma: `diario.access` para LER, `diario.report.manage`
/// para escrever. É o que permite um perfil de acompanhamento (Diretoria, hoje)
/// abrir os relatórios das obras dele sem poder alterá-los.
///
/// A permissão de escrita é declarada por método, sobrepondo a da classe — o
/// `PermissionsGuard` usa `getAllAndOverride`, então o que está no método vence
/// e precisa repetir `diario.access` junto (as permissões são exigidas em AND).
///
/// Nenhuma rota daqui confia no id que recebe: quem decide o que é visível é o
/// `SiteAccessService`, dentro do service.
@RequirePermissions('diario.access')
@Controller('diario/relatorios')
export class DailyReportsController {
  constructor(private readonly reports: DailyReportsService) {}

  @Get()
  findAll(
    @Query() query: QueryDailyReportDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.findAll(companyId, userId, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.findOne(companyId, userId, id);
  }

  @RequirePermissions('diario.access', 'diario.report.manage')
  @Post()
  create(
    @Body() dto: CreateDailyReportDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.create(companyId, userId, dto);
  }

  /// Salvamento incremental. Devolve o relatório inteiro (e não 204) porque a
  /// tela precisa do `updatedAt` para dizer "salvo agora" com a hora do
  /// servidor, e não com a do aparelho — celular de obra tem relógio errado
  /// com uma frequência que surpreende.
  @RequirePermissions('diario.access', 'diario.report.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDailyReportDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.update(companyId, userId, id, dto);
  }

  /// Finalização — `DRAFT` -> `SUBMITTED`.
  ///
  /// Rota própria, e não `PATCH { status }`: finalizar é uma AÇÃO de domínio
  /// (valida pendências, carimba autor e instante, escreve auditoria e fecha o
  /// documento), não a edição de um campo. Como POST, ela também não se
  /// confunde com o autosave, que usa PATCH.
  ///
  /// Mesma permissão da edição (`diario.report.manage`). Não foi criada uma
  /// `diario.report.finalize`: hoje quem preenche é quem fecha, e uma permissão
  /// a mais só existiria para separar dois papéis que ainda são um só.
  @RequirePermissions('diario.access', 'diario.report.manage')
  @HttpCode(HttpStatus.OK)
  @Post(':id/finalizar')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.submit(companyId, userId, id);
  }

  /// `:id` é o relatório de ORIGEM; o corpo traz só a data nova. A obra do
  /// relatório criado vem da origem — ver `CopyDailyReportDto`.
  @RequirePermissions('diario.access', 'diario.report.manage')
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/copia')
  copy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CopyDailyReportDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.copy(companyId, userId, id, dto);
  }
}
