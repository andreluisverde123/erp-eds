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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  // Leitura liberada a qualquer usuário autenticado — o Financeiro precisa
  // listar fornecedores para filtrar contas a pagar.
  @RequirePermissions('compras.view')
  @Get()
  findAll(@Query() query: QuerySupplierDto, @CurrentUser('companyId') companyId: string) {
    return this.suppliersService.findAll(companyId, query);
  }

  @RequirePermissions('compras.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.suppliersService.findOne(companyId, id);
  }

  @RequirePermissions('compras.manage')
  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentUser('companyId') companyId: string) {
    return this.suppliersService.create(companyId, dto);
  }

  @RequirePermissions('compras.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.suppliersService.update(companyId, id, dto);
  }

  @RequirePermissions('compras.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.suppliersService.remove(companyId, id);
  }
}
