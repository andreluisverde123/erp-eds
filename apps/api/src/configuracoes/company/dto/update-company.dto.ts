import {
  IsEmail,
  IsOptional,
  IsString,
  IsUppercase,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false }, { message: 'Informe uma URL válida.' })
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  zipCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressComplement?: string;

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
  @IsString()
  @MaxLength(150)
  responsibleName?: string;
}
