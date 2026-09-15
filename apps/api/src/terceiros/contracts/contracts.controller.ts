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
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @RequirePermissions('terceiros.view')
  @Get()
  findAll(@Query() query: QueryContractDto, @CurrentUser('companyId') companyId: string) {
    return this.contractsService.findAll(companyId, query);
  }

  // Precisa vir antes de ":id" — usado pelo card de alerta na Home.
  @RequirePermissions('terceiros.view')
  @Get('expiring-summary')
  getExpiringSummary(@CurrentUser('companyId') companyId: string) {
    return this.contractsService.getExpiringSummary(companyId);
  }

  @RequirePermissions('terceiros.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractsService.findOne(companyId, id);
  }

  /// O PDF do contrato. Mesma permissão de VER o contrato: quem pode ver pode
  /// imprimir.
  @RequirePermissions('terceiros.view')
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const { buffer, code } = await this.contractsService.generatePdf(companyId, id);
    res.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @RequirePermissions('terceiros.manage')
  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser('companyId') companyId: string) {
    return this.contractsService.create(companyId, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.contractsService.update(companyId, id, dto);
  }

  @RequirePermissions('terceiros.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractStatusDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.contractsService.updateStatus(companyId, id, dto.status);
  }

  @RequirePermissions('terceiros.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.contractsService.remove(companyId, id);
  }
}
