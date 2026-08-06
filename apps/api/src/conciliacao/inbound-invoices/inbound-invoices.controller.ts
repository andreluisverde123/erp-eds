import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import { QueryInboundInvoiceDto } from './dto/query-inbound-invoice.dto';
import { ReconcileInboundInvoiceDto } from './dto/reconcile-inbound-invoice.dto';
import { InboundInvoicesService } from './inbound-invoices.service';

/// Financeiro > Conciliação de Notas. Reusa as permissões do módulo financeiro
/// (`view` para consultar, `manage` para agir) em vez de criar um par novo:
/// quem concilia nota é a mesma pessoa que mexe em contas a pagar, e uma
/// permissão a mais só apareceria como caixinha desmarcada na tela de perfis.
@Controller('inbound-invoices')
@RequirePermissions('financeiro.view')
export class InboundInvoicesController {
  constructor(private readonly inboundInvoices: InboundInvoicesService) {}

  @Get()
  findAll(@Query() query: QueryInboundInvoiceDto, @CurrentUser('companyId') companyId: string) {
    return this.inboundInvoices.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.inboundInvoices.findOne(companyId, id);
  }

  /// Ordens de compra compatíveis, da mais provável para a menos. Só leitura:
  /// nada é vinculado aqui.
  @Get(':id/suggestions')
  suggestions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.inboundInvoices.suggestions(companyId, id);
  }

  /// Ordens de compra em aberto para escolha manual, quando não há sugestão.
  @Get('options/purchase-orders')
  openOrders(
    @Query('search') search: string | undefined,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.inboundInvoices.listOpenOrders(companyId, search);
  }

  /// Centros de custo, para o lançamento sem ordem de compra.
  @Get('options/cost-centers')
  costCenters(@CurrentUser('companyId') companyId: string) {
    return this.inboundInvoices.listCostCenters(companyId);
  }

  /// Entrada manual — o único caminho de entrada desta versão. A captura
  /// automática (XML/SEFAZ) entrará por aqui também, mudando só a origem.
  @RequirePermissions('financeiro.manage')
  @Post()
  create(
    @Body() dto: CreateInboundInvoiceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.inboundInvoices.create(companyId, actingUserId, ip, dto);
  }

  /// Vincula a nota à ordem de compra e gera as parcelas de contas a pagar.
  @RequirePermissions('financeiro.manage')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reconcile')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileInboundInvoiceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.inboundInvoices.reconcile(companyId, actingUserId, ip, id, dto);
  }

  @RequirePermissions('financeiro.manage')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.inboundInvoices.cancel(companyId, actingUserId, ip, id);
  }
}
