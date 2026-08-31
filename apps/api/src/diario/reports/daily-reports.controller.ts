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
  Res,
  Query,
} from '@nestjs/common';

import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { DailyReportsService } from './daily-reports.service';
import { RdoPdfService } from './pdf/rdo-pdf.service';
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
  constructor(
    private readonly reports: DailyReportsService,
    private readonly pdf: RdoPdfService,
  ) {}

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

  /// Exporta o RDO em PDF.
  ///
  /// Só `diario.access`: exportar é LEITURA. Exigir `diario.report.manage` aqui
  /// impediria quem acompanha a obra sem preenchê-la de levar o documento para
  /// uma reunião — e não protegeria nada, porque essa pessoa já pode abrir o
  /// relatório inteiro na tela.
  ///
  /// Vale para rascunho e para finalizado. O que muda é o carimbo de situação
  /// impresso no documento, nunca a permissão de gerá-lo: um rascunho impresso
  /// é justamente o que se leva para conferir em campo antes de fechar o dia.
  @Get(':id/pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
  ) {
    const { bytes, nomeArquivo } = await this.pdf.export(companyId, userId, id);

    res.setHeader('Content-Type', 'application/pdf');
    // `attachment`: o RDO é para guardar, não para navegar. E o nome vai entre
    // aspas porque ele contém hífens e pontos que um cliente HTTP pode tratar
    // como fim do valor.
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Length', String(bytes.length));
    // Documento gerado sob autorização: nenhum cache compartilhado pode
    // guardá-lo. E nada de `max-age` — o rascunho muda a cada edição.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.end(bytes);
  }

  /// Exclui um rascunho, definitivamente.
  ///
  /// Sem permissão própria (`diario.report.delete`): a mesma decisão já tomada
  /// para a finalização. Quem pode escrever no relatório pode descartá-lo
  /// enquanto ele é rascunho — inventar um terceiro código daria a impressão
  /// de um controle que ninguém configuraria de forma diferente na prática.
  ///
  /// 204 sem corpo: não sobrou recurso para devolver.
  @RequirePermissions('diario.access', 'diario.report.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reports.remove(companyId, userId, id);
  }
}
