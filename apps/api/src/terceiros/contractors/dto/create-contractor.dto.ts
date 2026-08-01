import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  MaxLength,
} from 'class-validator';

import { ContractorStatus } from '../../../../generated/prisma/client';

export class CreateContractorDto {
  @IsString()
  @IsNotEmpty({ message: 'A razão social é obrigatória.' })
  @MaxLength(150)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsString()
  @IsNotEmpty({ message: 'O CNPJ/CPF é obrigatório.' })
  @MaxLength(20)
  document!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  responsibleName?: string;

  @IsOptional()
  @IsEnum(ContractorStatus, { message: 'Status inválido.' })
  status?: ContractorStatus;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsUppercase()
  @Length(2, 2, { message: 'A UF deve ter 2 letras.' })
  state?: string;
}
