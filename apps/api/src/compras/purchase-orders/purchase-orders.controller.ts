import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  // Leitura liberada a qualquer usuário autenticado — o Financeiro precisa
  // listar ordens de compra para vincular notas fiscais a elas.
  @RequirePermissions('compras.view')
  @Get()
  findAll(@Query() query: QueryPurchaseOrderDto, @CurrentUser('companyId') companyId: string) {
    return this.purchaseOrdersService.findAll(companyId, query);
  }

  @RequirePermissions('compras.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.purchaseOrdersService.findOne(companyId, id);
  }

  /// PDF da ordem de compra.
  ///
  /// Mesma permissão do `findOne` (`compras.view`), de propósito: quem pode
  /// VER a ordem pode imprimi-la, e quem não pode ver recebe o mesmo 403 de
  /// sempre. Nenhuma regra de RBAC nova foi criada para o documento.
  @RequirePermissions('compras.view')
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const { buffer, code } = await this.purchaseOrdersService.generatePdf(companyId, id);

    // `inline`: o comprador confere na tela antes de mandar ao fornecedor. O
    // navegador continua permitindo salvar.
    res.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @RequirePermissions('compras.manage')
  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('companyId') companyId: string,
    /// Quem emite assina o PDF. Vem do TOKEN, nunca do corpo: aceitar o autor
    /// do cliente deixaria qualquer um emitir a ordem em nome de outro.
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseOrdersService.create(companyId, userId, dto);
  }

  @RequirePermissions('compras.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.purchaseOrdersService.update(companyId, id, dto);
  }

  @RequirePermissions('compras.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.purchaseOrdersService.remove(companyId, id);
  }
}
