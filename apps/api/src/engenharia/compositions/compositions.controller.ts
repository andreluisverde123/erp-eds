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
import { CompositionsService } from './compositions.service';
import { CreateCompositionItemDto, UpdateCompositionItemDto } from './dto/composition-item.dto';
import { CreateCompositionDto } from './dto/create-composition.dto';
import { QueryCompositionCatalogOptionsDto, QueryCompositionDto } from './dto/query-composition.dto';
import { UpdateCompositionDto } from './dto/update-composition.dto';

/// Composições de custo.
///
/// `composicoes.*`, separadas de `catalogo.*`, porque aqui há PREÇO. Toda rota
/// declara a própria exigência, inclusive as de leitura: o guard usa
/// `getAllAndOverride`, e uma rota de escrita esquecida sem decoration
/// herdaria a leitura da classe.
@Controller('compositions')
@RequirePermissions('composicoes.view')
export class CompositionsController {
  constructor(private readonly compositionsService: CompositionsService) {}

  @RequirePermissions('composicoes.view')
  @Get()
  findAll(@Query() query: QueryCompositionDto, @CurrentUser('companyId') companyId: string) {
    return this.compositionsService.findAll(companyId, query);
  }

  /// Precisa vir antes de ":id" — senão "catalog-options" seria lido como id.
  @RequirePermissions('composicoes.manage')
  @Get('catalog-options')
  catalogOptions(
    @Query() query: QueryCompositionCatalogOptionsDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.compositionsService.catalogOptions(companyId, query.search, query.limit);
  }

  @RequirePermissions('composicoes.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.compositionsService.findOne(companyId, id);
  }

  @RequirePermissions('composicoes.manage')
  @Post()
  create(@Body() dto: CreateCompositionDto, @CurrentUser('companyId') companyId: string) {
    return this.compositionsService.create(companyId, dto);
  }

  @RequirePermissions('composicoes.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompositionDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.compositionsService.update(companyId, id, dto);
  }

  @RequirePermissions('composicoes.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.compositionsService.remove(companyId, id);
  }

  /// As três rotas de item devolvem a composição INTEIRA, recalculada: a tela
  /// mostra o custo que o servidor calculou, nunca uma conta própria.
  @RequirePermissions('composicoes.manage')
  @Post(':id/items')
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompositionItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.compositionsService.addItem(companyId, id, dto);
  }

  @RequirePermissions('composicoes.manage')
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCompositionItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.compositionsService.updateItem(companyId, id, itemId, dto);
  }

  @RequirePermissions('composicoes.manage')
  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.compositionsService.removeItem(companyId, id, itemId);
  }
}
