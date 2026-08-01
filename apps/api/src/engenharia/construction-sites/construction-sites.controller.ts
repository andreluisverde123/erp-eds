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
import { ConstructionSitesService } from './construction-sites.service';
import { CreateConstructionSiteDto } from './dto/create-construction-site.dto';
import { QueryConstructionSiteDto } from './dto/query-construction-site.dto';
import { UpdateConstructionSiteDto } from './dto/update-construction-site.dto';

@Controller('construction-sites')
export class ConstructionSitesController {
  constructor(private readonly constructionSitesService: ConstructionSitesService) {}

  // Leitura fica liberada pra qualquer usuário autenticado (`dashboard.view` é
  // concedido a todos os papéis) — outros módulos (Compras, Financeiro, RH)
  // precisam listar obras/centros de custo em seus próprios formulários sem
  // precisar da permissão de gestão da Engenharia. Escrita continua restrita.
  @RequirePermissions('engenharia.view')
  @Get()
  findAll(@Query() query: QueryConstructionSiteDto, @CurrentUser('companyId') companyId: string) {
    return this.constructionSitesService.findAll(companyId, query);
  }

  @RequirePermissions('engenharia.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.constructionSitesService.findOne(companyId, id);
  }

  @RequirePermissions('engenharia.manage')
  @Post()
  create(@Body() dto: CreateConstructionSiteDto, @CurrentUser('companyId') companyId: string) {
    return this.constructionSitesService.create(companyId, dto);
  }

  @RequirePermissions('engenharia.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConstructionSiteDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.constructionSitesService.update(companyId, id, dto);
  }

  @RequirePermissions('engenharia.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.constructionSitesService.remove(companyId, id);
  }
}
