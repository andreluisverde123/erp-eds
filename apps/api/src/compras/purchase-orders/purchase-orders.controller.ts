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

  @RequirePermissions('compras.manage')
  @Post()
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser('companyId') companyId: string) {
    return this.purchaseOrdersService.create(companyId, dto);
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
