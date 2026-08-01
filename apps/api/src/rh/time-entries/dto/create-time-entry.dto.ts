import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTimeEntryDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;

  @IsISO8601(undefined, { message: 'Data inválida.' })
  date!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Horário de entrada inválido.' })
  checkIn?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Horário de saída inválido.' })
  checkOut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
