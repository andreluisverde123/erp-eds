import { IsEnum, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { ReferenceRegime, ReferenceSource } from '../../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { BRAZILIAN_UFS } from '../parsing/locations';

/// Campos do formulário multipart de prévia e importação de base referencial.
///
/// - SINAPI: um arquivo (`SINAPI_Referência_AAAA_MM.xlsx`), mais UF e regime —
///   a pasta traz as 27 UF e os três regimes, e cada dataset é um recorte.
/// - SICRO: os XLSX de dentro do pacote da UF. UF e competência vêm do próprio
///   relatório; o regime é sempre sem desoneração.
///
/// `fileHash` só na confirmação: é o SHA-256 que a prévia devolveu, e garante
/// que o arquivo importado é o mesmo que a pessoa conferiu.
export class ReferenceImportDto {
  @IsEnum(ReferenceSource, { message: 'Fonte inválida.' })
  source!: ReferenceSource;

  @IsOptional()
  @IsIn(BRAZILIAN_UFS, { message: 'UF inválida.' })
  uf?: string;

  @IsOptional()
  @IsEnum(ReferenceRegime, { message: 'Regime inválido.' })
  regime?: ReferenceRegime;

  /// Vazio na publicação original; "revisado" (ou outro rótulo) numa
  /// republicação da mesma competência.
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Máximo de 40 caracteres.' })
  @Matches(/^[\p{L}\p{N} ._-]*$/u, { message: 'Use só letras, números, espaço, ponto, hífen e sublinhado.' })
  versionLabel?: string;

  @IsOptional()
  @IsString()
  @Length(64, 64, { message: 'Identificador do arquivo analisado inválido.' })
  fileHash?: string;
}

export class QueryReferenceDatasetDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReferenceSource, { message: 'Fonte inválida.' })
  source?: ReferenceSource;

  @IsOptional()
  @IsIn(BRAZILIAN_UFS, { message: 'UF inválida.' })
  uf?: string;

  @IsOptional()
  @IsEnum(ReferenceRegime, { message: 'Regime inválido.' })
  regime?: ReferenceRegime;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Competência inválida. Use AAAA-MM.' })
  competence?: string;
}

export class QueryReferenceSearchDto extends PaginationQueryDto {
  /// Código (prefixo) ou descrição (qualquer trecho, sem acento).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
