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
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { UpdatePurchaseRequestQuoteDto } from './dto/update-purchase-request-quote.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@Controller('purchase-requests')
@RequirePermissions('compras.view')
export class PurchaseRequestsController {
  constructor(private readonly purchaseRequestsService: PurchaseRequestsService) {}

  @Get()
  findAll(@Query() query: QueryPurchaseRequestDto, @CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.findOne(companyId, id);
  }

  /// Abrir e editar solicitação é `compras.request`, não `compras.manage`:
  /// quem pede é a Engenharia, quem compra é o setor de Compras.
  @RequirePermissions('compras.request')
  @Post()
  create(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseRequestsService.create(companyId, userId, dto);
  }

  @RequirePermissions('compras.request')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.purchaseRequestsService.update(companyId, id, dto);
  }

  /// Cotação: só Compras informa valor unitário, e só enquanto a solicitação
  /// está aguardando aprovação ou em cotação (ver o service).
  @RequirePermissions('compras.manage')
  @Patch(':id/quote')
  updateQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestQuoteDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.purchaseRequestsService.updateQuote(companyId, id, dto);
  }

  /// Barra baixa de propósito: com `compras.request` o solicitante só consegue
  /// enviar ou cancelar o PRÓPRIO rascunho — as demais transições continuam
  /// exigindo `compras.manage`, e quem separa isso é o service.
  @RequirePermissions('compras.request')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestStatusDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('permissions') permissions: string[],
  ) {
    return this.purchaseRequestsService.updateStatus(companyId, id, dto.status, permissions);
  }

  @RequirePermissions('compras.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.remove(companyId, id);
  }
}
