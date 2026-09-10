import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AttendanceEntryDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  @IsBoolean({ message: 'Presença inválida.' })
  present!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

/// Salva a chamada de um dia inteiro, de uma vez.
///
/// O dia inteiro num pedido só, e não uma linha por vez, por duas razões: é
/// como o mestre de obras trabalha (marca todo mundo e salva), e é o que
/// permite gravar tudo numa transação — meio dia apontado é pior que nenhum.
export class SaveAttendanceDayDto {
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsISO8601(undefined, { message: 'Data inválida.' })
  date!: string;

  @IsArray()
  // Teto generoso: a maior obra da EDS não chega perto disso, e o limite
  // existe para um corpo malformado não virar uma transação de dez mil linhas.
  @ArrayMaxSize(500, { message: 'Apontamento com colaboradores demais.' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}
