import { PartialType } from '@nestjs/mapped-types';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { BudgetItemSource, BudgetStatus } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { IsDateOnly } from '../../catalog-item-prices/date-only.validator';
import { IsCanonicalUnit } from '../../catalog-items/is-canonical-unit.validator';
import { IsBudgetBdi, IsBudgetQuantity, IsBudgetUnitCost } from '../budget-number.validator';

/// Sem `code`, `version`, `status` nem total: são do servidor. Mandar qualquer
/// um é recusado (`forbidNonWhitelisted`).
export class CreateBudgetDto {
  @IsUUID('all', { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150, { message: 'Máximo de 150 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Máximo de 1000 caracteres.' })
  description?: string;

  /// Data-base `AAAA-MM-DD`.
  @IsDateOnly()
  referenceDate!: string;
}

export class UpdateBudgetDto extends PartialType(CreateBudgetDto) {
  /// BDI em percentual: 25 = 25%. Zero é válido.
  @IsOptional()
  @IsBudgetBdi()
  bdiPercent?: number | string;

  /// Composição do BDI, premissas. Vazio apaga.
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo de 500 caracteres.' })
  bdiNote?: string;
}

export class QueryBudgetDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(BudgetStatus, { message: 'Status inválido.' })
  status?: BudgetStatus;

  @IsOptional()
  @IsUUID('all', { message: 'Obra inválida.' })
  constructionSiteId?: string;
}

export class QueryOptionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class QueryReferenceOptionsDto {
  @IsUUID('all', { message: 'Base referencial inválida.' })
  datasetId!: string;

  @IsIn(['ITEM', 'COMPOSITION'], { message: 'Escolha insumo ou composição.' })
  kind!: 'ITEM' | 'COMPOSITION';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateBudgetNodeDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do grupo é obrigatório.' })
  @MaxLength(150, { message: 'Máximo de 150 caracteres.' })
  name!: string;

  /// Ausente = grupo raiz. O pai não se troca depois.
  @IsOptional()
  @IsUUID('all', { message: 'Grupo pai inválido.' })
  parentId?: string;
}

export class UpdateBudgetNodeDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do grupo é obrigatório.' })
  @MaxLength(150, { message: 'Máximo de 150 caracteres.' })
  name!: string;
}

export class MoveBudgetNodeDto {
  @IsIn(['UP', 'DOWN'], { message: 'Direção inválida.' })
  direction!: 'UP' | 'DOWN';
}

/// A linha do orçamento. Os campos aceitos dependem da origem, e o service diz
/// qual falta ou sobra:
///
/// | origem | exige | recusa |
/// | --- | --- | --- |
/// | COMPOSITION | `compositionId` | `unitCost`, `description`, `unit`, `catalogItemId`, referência |
/// | CATALOG_ITEM | `catalogItemId`, `unitCost` | `description`, `unit`, `compositionId`, referência |
/// | MANUAL | `description`, `unit`, `unitCost` | `compositionId`, `catalogItemId`, referência |
/// | REFERENCE | `referenceItemId` OU `referenceCompositionId` | `unitCost`, `description`, `unit`, `compositionId`, `catalogItemId` |
///
/// `totalCost` não existe aqui: é derivado.
export class CreateBudgetItemDto {
  @IsUUID('all', { message: 'Grupo da EAP inválido.' })
  budgetNodeId!: string;

  @IsEnum(BudgetItemSource, { message: 'Origem inválida.' })
  source!: BudgetItemSource;

  @IsBudgetQuantity()
  quantity!: number | string;

  @IsOptional()
  @IsUUID('all', { message: 'Composição inválida.' })
  compositionId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Insumo inválido.' })
  catalogItemId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Insumo da base referencial inválido.' })
  referenceItemId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Composição da base referencial inválida.' })
  referenceCompositionId?: string;

  @IsOptional()
  @IsBudgetUnitCost()
  unitCost?: number | string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo de 300 caracteres.' })
  description?: string;

  @IsOptional()
  @IsCanonicalUnit()
  unit?: string;
}

export class UpdateBudgetItemDto {
  @IsOptional()
  @IsBudgetQuantity()
  quantity?: number | string;

  @IsOptional()
  @IsBudgetUnitCost()
  unitCost?: number | string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo de 300 caracteres.' })
  description?: string;

  @IsOptional()
  @IsCanonicalUnit()
  unit?: string;
}

/// Campos do formulário multipart de importação de planilha.
export class BudgetImportDto {
  /// Base usada pelas linhas REFERENCIA.
  @IsOptional()
  @IsUUID('all', { message: 'Base referencial inválida.' })
  referenceDatasetId?: string;

  /// SHA-256 devolvido pela prévia. Só na confirmação.
  @IsOptional()
  @IsString()
  @Length(64, 64, { message: 'Identificador do arquivo analisado inválido.' })
  fileHash?: string;
}

export class QueryBudgetExportDto {
  @IsIn(['xlsx', 'pdf'], { message: 'Formato inválido. Use xlsx ou pdf.' })
  format!: 'xlsx' | 'pdf';
}
