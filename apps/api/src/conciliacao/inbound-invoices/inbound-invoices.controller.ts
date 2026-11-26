import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import { QueryInboundInvoiceDto } from './dto/query-inbound-invoice.dto';
import { ReconcileInboundInvoiceDto } from './dto/reconcile-inbound-invoice.dto';
import { InboundInvoicesService } from './inbound-invoices.service';

/// Financeiro > Conciliação de Notas. Tem par próprio (`conciliacao.view` /
/// `conciliacao.manage`) em vez de reusar `financeiro.*`: a EDS quis um perfil
/// de aprendiz que concilia nota sem enxergar contas a pagar nem pagamentos.
/// A migration que criou o par deu `conciliacao.*` a todo papel que já tinha
/// o `financeiro.*` correspondente, então ninguém perdeu acesso.
@Controller('inbound-invoices')
@RequirePermissions('conciliacao.view')
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

  /// DANFE da nota, gerado do XML da SEFAZ. Mesma permissão de ver a nota
  /// (`financeiro.view`, herdada da classe): quem vê a nota pode imprimi-la.
  @Get(':id/danfe')
  @Header('Content-Type', 'application/pdf')
  async danfe(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.inboundInvoices.generateDanfe(companyId, id);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /// Ordens de compra compatíveis, da mais provável para a menos. Só leitura:
  /// nada é vinculado aqui.
  @Get(':id/suggestions')
  suggestions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.inboundInvoices.suggestions(companyId, id);
  }

  /// Ordens de compra em aberto para escolha manual, quando não há sugestão.
  /// Comparação lado a lado com UMA ordem escolhida, inclusive uma que não
  /// veio nas sugestões. Leitura pura — `financeiro.view`, herdado da classe,
  /// exatamente como as sugestões. Nenhuma permissão nova.
  @Get(':id/compare/:purchaseOrderId')
  compare(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('purchaseOrderId', ParseUUIDPipe) purchaseOrderId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.inboundInvoices.compareWithOrder(companyId, id, purchaseOrderId);
  }

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
  @RequirePermissions('conciliacao.manage')
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
  @RequirePermissions('conciliacao.manage')
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

  @RequirePermissions('conciliacao.manage')
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
