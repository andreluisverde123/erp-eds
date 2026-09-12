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
import { MEASUREMENT_UNITS } from '../../common/units/measurement-units';
import { CatalogItemsService } from './catalog-items.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { QueryCatalogItemDto } from './dto/query-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

/// Cadastro de insumos.
///
/// `catalogo.*` e não `engenharia.*`: o insumo é cadastro da EMPRESA, consumido
/// por Compras hoje e por Orçamento amanhã. Pendurá-lo em Engenharia amarraria
/// quem mantém o catálogo a quem cadastra obra.
@Controller('catalog-items')
@RequirePermissions('catalogo.view')
export class CatalogItemsController {
  constructor(private readonly catalogItemsService: CatalogItemsService) {}

  @Get()
  findAll(@Query() query: QueryCatalogItemDto, @CurrentUser('companyId') companyId: string) {
    return this.catalogItemsService.findAll(companyId, query);
  }

  /// Precisa vir antes de ":id" — senão "units" seria lido como um id.
  ///
  /// A lista canônica servida pela API, e não digitada na tela: é a mesma que
  /// o validador usa, então a tela nunca oferece um código que o servidor
  /// recusa.
  @Get('units')
  units() {
    return MEASUREMENT_UNITS;
  }

  @Get('categories')
  categories(@CurrentUser('companyId') companyId: string) {
    return this.catalogItemsService.categories(companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.catalogItemsService.findOne(companyId, id);
  }

  @RequirePermissions('catalogo.manage')
  @Post()
  create(@Body() dto: CreateCatalogItemDto, @CurrentUser('companyId') companyId: string) {
    return this.catalogItemsService.create(companyId, dto);
  }

  @RequirePermissions('catalogo.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.catalogItemsService.update(companyId, id, dto);
  }

  @RequirePermissions('catalogo.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.catalogItemsService.remove(companyId, id);
  }
}
