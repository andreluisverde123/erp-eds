import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  QueryReferenceDatasetDto,
  QueryReferenceSearchDto,
  ReferenceImportDto,
} from './dto/reference.dto';
import { ReferenceDatasetsService, type UploadedReferenceFile } from './reference-datasets.service';

/// O SINAPI mensal tem ~14 MB e o analítico do SICRO de uma UF, ~15 MB.
const TAMANHO_MAXIMO = 60 * 1024 * 1024;
/// Os cinco relatórios do SICRO, com folga para os que são enviados e ignorados.
const MAXIMO_DE_ARQUIVOS = 30;

const uploadDeBase = FilesInterceptor('files', MAXIMO_DE_ARQUIVOS, {
  storage: memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: MAXIMO_DE_ARQUIVOS },
  fileFilter: (_req, file, callback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      callback(new BadRequestException('Envie as planilhas .xlsx da base (extraia o .zip/.7z antes).'), false);
      return;
    }
    callback(null, true);
  },
});

/// O multer entrega `originalname` decodificado como latin1: "Relatório" chega
/// "RelatÃ³rio". O SICRO é identificado pelo nome do arquivo, então o nome
/// precisa voltar a UTF-8.
function nomesEmUtf8(files: Express.Multer.File[] | undefined): UploadedReferenceFile[] {
  return (files ?? []).map((arquivo) => {
    const convertido = Buffer.from(arquivo.originalname, 'latin1').toString('utf8');
    return {
      originalname: convertido.includes('�') ? arquivo.originalname : convertido,
      buffer: arquivo.buffer,
    };
  });
}

/// Bases referenciais. Pertencem a Orçamentos: consultar exige
/// `orcamentos.view`; analisar e importar, `orcamentos.manage`.
@Controller('reference-datasets')
@RequirePermissions('orcamentos.view')
export class ReferenceDatasetsController {
  constructor(private readonly referenceDatasets: ReferenceDatasetsService) {}

  @RequirePermissions('orcamentos.view')
  @Get()
  findAll(@Query() query: QueryReferenceDatasetDto) {
    return this.referenceDatasets.findAll(query);
  }

  /// Lê e valida o arquivo. NÃO grava nada.
  @RequirePermissions('orcamentos.manage')
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(uploadDeBase)
  preview(@Body() dto: ReferenceImportDto, @UploadedFiles() files: Express.Multer.File[]) {
    return this.referenceDatasets.preview(dto, nomesEmUtf8(files));
  }

  /// Confirma a prévia: mesmo arquivo (conferido pelo hash), tudo ou nada.
  @RequirePermissions('orcamentos.manage')
  @Post('import')
  @UseInterceptors(uploadDeBase)
  import(
    @Body() dto: ReferenceImportDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.referenceDatasets.import(companyId, userId, dto, nomesEmUtf8(files));
  }


  @RequirePermissions('orcamentos.view')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.referenceDatasets.findOne(id);
  }

  @RequirePermissions('orcamentos.view')
  @Get(':id/items')
  searchItems(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryReferenceSearchDto) {
    return this.referenceDatasets.searchItems(id, query);
  }

  /// A composição analítica PRECIFICADA nesta base (UF + regime).
  @RequirePermissions('orcamentos.view')
  @Get(':id/compositions/:compositionId')
  findComposition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('compositionId', ParseUUIDPipe) compositionId: string,
  ) {
    return this.referenceDatasets.findComposition(id, compositionId);
  }

  @RequirePermissions('orcamentos.view')
  @Get(':id/compositions')
  searchCompositions(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryReferenceSearchDto) {
    return this.referenceDatasets.searchCompositions(id, query);
  }
}
