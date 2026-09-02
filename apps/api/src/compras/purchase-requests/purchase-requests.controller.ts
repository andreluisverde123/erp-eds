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
import { ItemSuggestionsService } from './item-suggestions.service';
import { QueryItemSuggestionDto } from './dto/query-item-suggestion.dto';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { UpdatePurchaseRequestQuoteDto } from './dto/update-purchase-request-quote.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@Controller('purchase-requests')
@RequirePermissions('compras.view')
export class PurchaseRequestsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly itemSuggestions: ItemSuggestionsService,
  ) {}

  @Get()
  findAll(@Query() query: QueryPurchaseRequestDto, @CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.findAll(companyId, query);
  }

  /// Contagem do que está parado esperando alguém — alimenta o alerta da Home.
  ///
  /// Antes de `:id`, como a de sugestões: rota literal declarada depois de um
  /// parâmetro nunca é alcançada.
  @Get('pending-summary')
  getPendingSummary(@CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.getPendingSummary(companyId);
  }

  /// Materiais já pedidos que casam com o que está sendo digitado.
  ///
  /// Antes de `:id` de propósito: uma rota literal declarada depois de um
  /// parâmetro nunca é alcançada — "item-suggestions" viraria um id inválido.
  ///
  /// `compras.request`, e NÃO `compras.view`, que era o que a classe impunha
  /// por herança.
  ///
  /// A sugestão é auxiliar do FORMULÁRIO de solicitação, e o formulário exige
  /// `compras.request` (`create` e `update` abaixo). Como o guard usa
  /// `getAllAndOverride`, a permissão do método vence a da classe — então
  /// `create` pedia `compras.request` e esta rota continuava pedindo
  /// `compras.view`. Um perfil personalizado com "pode solicitar" e sem "pode
  /// visualizar" abria o formulário, salvava normalmente e levava 403 só aqui:
  /// o autocomplete morria sozinho, sem nada na tela dizendo por quê.
  ///
  /// Não é permissão nova nem afrouxamento: quem pode ABRIR uma solicitação já
  /// enxerga o histórico de solicitações da própria empresa — que é exatamente
  /// o dado devolvido aqui, escopado por `companyId`.
  @RequirePermissions('compras.request')
  @Get('item-suggestions')
  suggestItems(
    @Query() query: QueryItemSuggestionDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.itemSuggestions.search(companyId, query.search, query.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.purchaseRequestsService.findOne(companyId, id);
  }

  /// PDF da solicitação.
  ///
  /// Mesma permissão do `findOne` (`compras.view`), de propósito: quem pode
  /// VER a solicitação pode imprimi-la, e quem não pode ver recebe o mesmo 403
  /// de sempre. Nenhuma regra de RBAC nova foi criada para o documento —
  /// mesma decisão já tomada no PDF da ordem de compra.
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const { buffer, code } = await this.purchaseRequestsService.generatePdf(companyId, id);

    // `inline`: quem gera confere na tela antes de imprimir ou encaminhar. O
    // navegador continua permitindo salvar.
    res.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
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
