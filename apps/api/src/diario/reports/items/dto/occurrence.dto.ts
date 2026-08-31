import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { OccurrenceType } from '../../../../../generated/prisma/client';

export class CreateOccurrenceDto {
  @IsEnum(OccurrenceType, { message: 'Tipo de ocorrência inválido.' })
  type!: OccurrenceType;

  @IsString()
  @IsNotEmpty({ message: 'Descreva a ocorrência.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description!: string;

  /// OPCIONAL, e isso é regra e não descuido: "chuva intensa durante a tarde"
  /// é um registro legítimo e não tem hora. Exigi-la faria o usuário inventar
  /// uma, e um horário inventado é pior que nenhum.
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Informe o horário no formato HH:MM.' })
  occurredAtTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;
}

export class UpdateOccurrenceDto {
  @IsOptional()
  @IsEnum(OccurrenceType, { message: 'Tipo de ocorrência inválido.' })
  type?: OccurrenceType;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Descreva a ocorrência.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string;

  /// `null` limpa o horário — é como a tela desmarca um horário informado por
  /// engano. Sem aceitar `null`, o campo só poderia ser corrigido, nunca
  /// apagado.
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Informe o horário no formato HH:MM.' })
  occurredAtTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;
}
