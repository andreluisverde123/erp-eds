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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { formatCurrency, formatDate } from '../../common/pdf/printable-document';
import { streamPdf } from '../../relatorios/reports/export.util';
import { AccountPayablesService } from './account-payables.service';
import { ApprovePaymentDto } from './dto/approve-payment.dto';
import { QueryPaymentScheduleDto } from './dto/query-payment-schedule.dto';
import { CreateAccountPayableDto } from './dto/create-account-payable.dto';
import { QueryAccountPayableDto } from './dto/query-account-payable.dto';
import { UpdateAccountPayableDto } from './dto/update-account-payable.dto';
import { UpdateAccountPayableStatusDto } from './dto/update-account-payable-status.dto';

@Controller('account-payables')
@RequirePermissions('financeiro.view')
export class AccountPayablesController {
  constructor(private readonly accountPayablesService: AccountPayablesService) {}

  @Get()
  findAll(@Query() query: QueryAccountPayableDto, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.findAll(companyId, query);
  }

  // Precisa vir antes de `:id` — senão "summary" seria interpretado como id.
  @Get('summary')
  getSummary(@CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.getSummary(companyId);
  }

  /// Programação de pagamentos da semana (o "resumo de sexta"). Antes de `:id`.
  @Get('schedule')
  getSchedule(
    @Query() query: QueryPaymentScheduleDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.getSchedule(companyId, query.week);
  }

  /// O mesmo resumo em PDF, para mandar ou imprimir.
  @Get('schedule/pdf')
  async exportSchedule(
    @Query() query: QueryPaymentScheduleDto,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const programacao = await this.accountPayablesService.getSchedule(companyId, query.week);
    const dia = (iso: string) => formatDate(new Date(iso));

    // Textos curtos de propósito: o `streamPdf` usa altura de linha fixa, e
    // uma célula que quebra invade a linha de baixo.
    const primeiroNome = (nome: string) => nome.replace(/^\[[^\]]*\]\s*/, '').split(' ')[0];
    const rows = programacao.rows.map((conta) => ({
      dueDate: `${formatDate(conta.dueDate)}${conta.overdue ? ' (vencida)' : ''}`,
      supplier: conta.supplier.tradeName ?? conta.supplier.legalName,
      site: conta.constructionSite?.name ?? '—',
      document: conta.invoice ? `NF ${conta.invoice.number}` : (conta.description ?? '—'),
      amount: formatCurrency(conta.remaining),
      approved: conta.approvedForPaymentAt
        ? `Sim${conta.approvedForPaymentBy ? ` · ${primeiroNome(conta.approvedForPaymentBy.name)}` : ''}`
        : 'Não',
      attachments: String(conta.attachmentsCount + conta.invoiceAttachmentsCount),
    }));
    const vazia = {
      dueDate: '',
      supplier: '',
      site: '',
      document: '',
      amount: '',
      approved: '',
      attachments: '',
    };
    rows.push(
      { ...vazia },
      { ...vazia, dueDate: 'Total', amount: formatCurrency(programacao.totals.total) },
      { ...vazia, dueDate: 'Vencidas', amount: formatCurrency(programacao.totals.overdue) },
      { ...vazia, dueDate: 'Liberado', amount: formatCurrency(programacao.totals.approved) },
      {
        ...vazia,
        dueDate: 'Falta liberar',
        amount: formatCurrency(programacao.totals.pendingApproval),
      },
    );

    streamPdf(
      res,
      `programacao-pagamentos-${programacao.weekStart}`,
      `Programação de pagamentos — ${dia(programacao.weekStart)} a ${dia(programacao.weekEnd)}`,
      [
        { key: 'dueDate', label: 'Vencimento' },
        { key: 'supplier', label: 'Fornecedor' },
        { key: 'site', label: 'Obra' },
        { key: 'document', label: 'Documento' },
        { key: 'amount', label: 'A pagar', align: 'right' },
        { key: 'approved', label: 'Liberado' },
        { key: 'attachments', label: 'Anexos', align: 'right' },
      ],
      rows,
    );
  }

  /// Libera contas para pagamento. `financeiro.approve`: quem faz o resumo de
  /// sexta (a diretoria), não quem paga.
  @RequirePermissions('financeiro.approve')
  @Post('approve-payment')
  @HttpCode(HttpStatus.OK)
  approvePayment(
    @Body() dto: ApprovePaymentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.accountPayablesService.approveForPayment(companyId, userId, dto.ids);
  }

  @RequirePermissions('financeiro.approve')
  @Delete(':id/approve-payment')
  revokePaymentApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.revokePaymentApproval(companyId, id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.findOne(companyId, id);
  }

  @RequirePermissions('financeiro.manage')
  @Post()
  create(@Body() dto: CreateAccountPayableDto, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.create(companyId, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountPayableDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.update(companyId, id, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountPayableStatusDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.accountPayablesService.updateStatus(companyId, id, dto.status);
  }

  @RequirePermissions('financeiro.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.accountPayablesService.remove(companyId, id);
  }
}
