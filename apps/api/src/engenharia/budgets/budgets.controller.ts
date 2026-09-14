import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { BudgetTransferService } from './budget-transfer.service';
import { BudgetsService } from './budgets.service';
import {
  BudgetImportDto,
  CreateBudgetDto,
  CreateBudgetItemDto,
  CreateBudgetNodeDto,
  MoveBudgetNodeDto,
  QueryBudgetDto,
  QueryBudgetExportDto,
  QueryOptionsDto,
  QueryReferenceOptionsDto,
  UpdateBudgetDto,
  UpdateBudgetItemDto,
  UpdateBudgetNodeDto,
} from './dto/budget.dto';

const uploadDePlanilha = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      callback(new BadRequestException('Envie a planilha no formato .xlsx do modelo de importação.'), false);
      return;
    }
    callback(null, true);
  },
});

function exigirArquivo(file: Express.Multer.File | undefined): Buffer {
  if (!file) throw new BadRequestException('Envie a planilha.');
  return file.buffer;
}

/// Orçamentos de obra.
///
/// `orcamentos.view` consulta, vê versões e exporta; `orcamentos.manage` cria,
/// edita rascunho, monta a EAP, inclui itens, define BDI, importa, fecha,
/// revisa e define o orçamento oficial. Toda rota declara a própria exigência:
/// o guard usa `getAllAndOverride`, e uma rota de escrita sem decoration
/// herdaria a leitura da classe.
///
/// As buscas de obra, composição, insumo e base referencial moram AQUI e
/// exigem `orcamentos.manage`, e não a permissão do outro módulo: servem o
/// editor de orçamento, e exigir outra permissão faria o autocomplete falhar
/// em silêncio para quem só orça.
///
/// Toda escrita devolve o orçamento inteiro, com a EAP e os totais
/// recalculados pelo servidor.
@Controller('budgets')
@RequirePermissions('orcamentos.view')
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly transfer: BudgetTransferService,
  ) {}

  @RequirePermissions('orcamentos.view')
  @Get()
  findAll(@Query() query: QueryBudgetDto, @CurrentUser('companyId') companyId: string) {
    return this.budgetsService.findAll(companyId, query);
  }

  /// Antes de ":id".
  @RequirePermissions('orcamentos.manage')
  @Get('construction-site-options')
  constructionSiteOptions(
    @Query() query: QueryOptionsDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.constructionSiteOptions(companyId, query.search);
  }

  /// O modelo de importação, gerado pelo ERP. Antes de ":id".
  @RequirePermissions('orcamentos.manage')
  @Get('import-template')
  async importTemplate(@Res() res: Response) {
    const buffer = await this.transfer.template();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-orcamento.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @RequirePermissions('orcamentos.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.budgetsService.findOne(companyId, id);
  }

  @RequirePermissions('orcamentos.manage')
  @Post()
  create(
    @Body() dto: CreateBudgetDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.budgetsService.create(companyId, userId, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.update(companyId, id, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.budgetsService.remove(companyId, id);
  }

  @RequirePermissions('orcamentos.manage')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.budgetsService.close(companyId, id, userId);
  }

  /// Nova versão (rascunho) a partir deste orçamento fechado.
  @RequirePermissions('orcamentos.manage')
  @Post(':id/revisions')
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.budgetsService.revise(companyId, id, userId);
  }

  @RequirePermissions('orcamentos.view')
  @Get(':id/versions')
  versions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.budgetsService.versions(companyId, id);
  }

  @RequirePermissions('orcamentos.manage')
  @Post(':id/official')
  @HttpCode(HttpStatus.OK)
  setOfficial(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.budgetsService.setOfficial(companyId, id, userId);
  }

  @RequirePermissions('orcamentos.view')
  @Get(':id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryBudgetExportDto,
    @CurrentUser('companyId') companyId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, contentType } = await this.transfer.export(companyId, id, query.format);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /// Lê a planilha e mostra o que seria importado. NÃO grava.
  @RequirePermissions('orcamentos.manage')
  @Post(':id/import/preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(uploadDePlanilha)
  importPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BudgetImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.transfer.preview(companyId, id, exigirArquivo(file), dto);
  }

  /// Confirma a prévia: a mesma planilha (conferida pelo hash), tudo ou nada.
  @RequirePermissions('orcamentos.manage')
  @Post(':id/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(uploadDePlanilha)
  import(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BudgetImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.transfer.import(companyId, userId, id, exigirArquivo(file), dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Get(':id/composition-options')
  compositionOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryOptionsDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.compositionOptions(companyId, id, query.search);
  }

  @RequirePermissions('orcamentos.manage')
  @Get(':id/catalog-options')
  catalogOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryOptionsDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.catalogOptions(companyId, id, query.search);
  }

  @RequirePermissions('orcamentos.manage')
  @Get(':id/reference-dataset-options')
  referenceDatasetOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.referenceDatasetOptions(companyId, id);
  }

  @RequirePermissions('orcamentos.manage')
  @Get(':id/reference-options')
  referenceOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryReferenceOptionsDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.referenceOptions(companyId, id, query);
  }

  @RequirePermissions('orcamentos.manage')
  @Post(':id/nodes')
  addNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBudgetNodeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.addNode(companyId, id, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Patch(':id/nodes/:nodeId')
  updateNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateBudgetNodeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.updateNode(companyId, id, nodeId, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Post(':id/nodes/:nodeId/move')
  @HttpCode(HttpStatus.OK)
  moveNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: MoveBudgetNodeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.moveNode(companyId, id, nodeId, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Delete(':id/nodes/:nodeId')
  removeNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.removeNode(companyId, id, nodeId);
  }

  @RequirePermissions('orcamentos.manage')
  @Post(':id/items')
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBudgetItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.addItem(companyId, id, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateBudgetItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.updateItem(companyId, id, itemId, dto);
  }

  @RequirePermissions('orcamentos.manage')
  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.budgetsService.removeItem(companyId, id, itemId);
  }
}
