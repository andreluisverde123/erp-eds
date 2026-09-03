import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryItemSuggestionDto {
  /// O que a pessoa digitou até agora. A busca vale a partir da PRIMEIRA
  /// letra — ver `MINIMO_DE_LETRAS` no service.
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
