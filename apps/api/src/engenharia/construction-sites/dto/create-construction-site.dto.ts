import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  MaxLength,
} from 'class-validator';

import { ConstructionStatus } from '../../../../generated/prisma/client';

export class CreateConstructionSiteDto {
  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório.' })
  @MaxLength(30)
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsUppercase()
  @Length(2, 2, { message: 'A UF deve ter 2 letras.' })
  state?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de início inválida.' })
  startDate?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de término inválida.' })
  expectedEndDate?: string;

  @IsOptional()
  @IsEnum(ConstructionStatus, { message: 'Status inválido.' })
  status?: ConstructionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
