import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CatalogItemPricesService } from './catalog-item-prices.service';
import {
  CreateManualPriceDto,
  CreatePurchasePriceDto,
  QueryPriceAtDto,
  QueryPriceHistoryDto,
} from './dto/catalog-item-price.dto';

/// Preços de referência de um insumo.
///
/// ## Por que `composicoes.*`, e não `catalogo.*`
///
/// Preço é informação financeira, e o ORC-02 separou exatamente isto: o
/// catálogo não tem preço (`catalogo.view` é de Compras também), e quem vê
/// custo é quem vê composição. Nenhuma permissão nova e nenhum papel ganhou
/// acesso:
///
/// | Ação | Exige | Papéis padrão |
/// | --- | --- | --- |
/// | consultar histórico e vigente | `composicoes.view` | Administrador, Engenharia, Diretoria |
/// | registrar manual | `composicoes.manage` | Administrador, Engenharia |
/// | ver e registrar preço de compra | `composicoes.manage` E `compras.view` | Administrador, Engenharia |
///
/// A rota de compra exige também `compras.view` porque mostra fornecedor,
/// ordem e preço negociado — dados de Compras. O guard exige TODAS as
/// permissões listadas.
///
/// Sem rota de edição nem de exclusão: o histórico não se reescreve.
@Controller('catalog-items/:catalogItemId/prices')
@RequirePermissions('composicoes.view')
export class CatalogItemPricesController {
  constructor(private readonly pricesService: CatalogItemPricesService) {}

  @RequirePermissions('composicoes.view')
  @Get()
  history(
    @Param('catalogItemId', ParseUUIDPipe) catalogItemId: string,
    @Query() query: QueryPriceHistoryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.pricesService.history(companyId, catalogItemId, query);
  }

  /// `?date=AAAA-MM-DD` — o preço vigente nessa data. Sem data, hoje.
  @RequirePermissions('composicoes.view')
  @Get('at')
  priceAt(
    @Param('catalogItemId', ParseUUIDPipe) catalogItemId: string,
    @Query() query: QueryPriceAtDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.pricesService.priceAt(companyId, catalogItemId, query.date);
  }

  @RequirePermissions('composicoes.manage')
  @Post()
  registerManual(
    @Param('catalogItemId', ParseUUIDPipe) catalogItemId: string,
    @Body() dto: CreateManualPriceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.pricesService.registerManual(companyId, userId, catalogItemId, dto);
  }

  @RequirePermissions('composicoes.manage', 'compras.view')
  @Get('purchase-candidates')
  purchaseCandidates(
    @Param('catalogItemId', ParseUUIDPipe) catalogItemId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.pricesService.purchaseCandidates(companyId, catalogItemId);
  }

  @RequirePermissions('composicoes.manage', 'compras.view')
  @Post('from-purchase')
  registerFromPurchase(
    @Param('catalogItemId', ParseUUIDPipe) catalogItemId: string,
    @Body() dto: CreatePurchasePriceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.pricesService.registerFromPurchase(companyId, userId, catalogItemId, dto);
  }
}
