import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { DailyReportItemsService } from './daily-report-items.service';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/equipment.dto';
import { CreateLaborDto, UpdateLaborDto } from './dto/labor.dto';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';
import { CreateOccurrenceDto, UpdateOccurrenceDto } from './dto/occurrence.dto';

/// Listas de conteúdo do RDO.
///
/// Todas as rotas são de ESCRITA, e por isso a classe inteira exige
/// `diario.report.manage` além de `diario.access` — não há um `@Get` aqui: a
/// leitura das listas vem junto do relatório, em `GET /diario/relatorios/:id`,
/// e uma rota separada para ler mão de obra seria uma segunda ida ao servidor
/// para dado que a tela já tem.
///
/// Cada operação devolve o RELATÓRIO inteiro, com o resumo recalculado. Ver a
/// explicação em `DailyReportItemsService`.
@RequirePermissions('diario.access', 'diario.report.manage')
@Controller('diario/relatorios/:reportId')
export class DailyReportItemsController {
  constructor(private readonly items: DailyReportItemsService) {}

  // --- Mão de obra ---------------------------------------------------------

  @Post('mao-de-obra')
  addLabor(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateLaborDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.addLabor(companyId, userId, reportId, dto);
  }

  @Patch('mao-de-obra/:itemId')
  updateLabor(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateLaborDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.updateLabor(companyId, userId, reportId, itemId, dto);
  }

  @Delete('mao-de-obra/:itemId')
  removeLabor(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.removeLabor(companyId, userId, reportId, itemId);
  }

  // --- Equipamentos --------------------------------------------------------

  @Post('equipamentos')
  addEquipment(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateEquipmentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.addEquipment(companyId, userId, reportId, dto);
  }

  @Patch('equipamentos/:itemId')
  updateEquipment(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateEquipmentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.updateEquipment(companyId, userId, reportId, itemId, dto);
  }

  @Delete('equipamentos/:itemId')
  removeEquipment(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.removeEquipment(companyId, userId, reportId, itemId);
  }

  // --- Atividades ----------------------------------------------------------

  @Post('atividades')
  addActivity(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.addActivity(companyId, userId, reportId, dto);
  }

  @Patch('atividades/:itemId')
  updateActivity(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.updateActivity(companyId, userId, reportId, itemId, dto);
  }

  @Delete('atividades/:itemId')
  removeActivity(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.removeActivity(companyId, userId, reportId, itemId);
  }

  // --- Materiais -----------------------------------------------------------

  @Post('materiais')
  addMaterial(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateMaterialDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.addMaterial(companyId, userId, reportId, dto);
  }

  @Patch('materiais/:itemId')
  updateMaterial(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.updateMaterial(companyId, userId, reportId, itemId, dto);
  }

  @Delete('materiais/:itemId')
  removeMaterial(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.removeMaterial(companyId, userId, reportId, itemId);
  }

  // --- Ocorrências ---------------------------------------------------------

  @Post('ocorrencias')
  addOccurrence(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateOccurrenceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.addOccurrence(companyId, userId, reportId, dto);
  }

  @Patch('ocorrencias/:itemId')
  updateOccurrence(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOccurrenceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.updateOccurrence(companyId, userId, reportId, itemId, dto);
  }

  @Delete('ocorrencias/:itemId')
  removeOccurrence(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.items.removeOccurrence(companyId, userId, reportId, itemId);
  }
}
