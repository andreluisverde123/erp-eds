import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryItemSuggestionDto {
  /// O que a pessoa digitou até agora. Abaixo de dois caracteres o service
  /// devolve lista vazia — uma letra sugere quase tudo e não ajuda a escolher.
  @IsString()
  @MaxLength(200)
  search!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
