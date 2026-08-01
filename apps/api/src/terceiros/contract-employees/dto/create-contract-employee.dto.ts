import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateContractEmployeeDto {
  @IsUUID(undefined, { message: 'Contrato inválido.' })
  contractId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'A função é obrigatória.' })
  @MaxLength(100)
  role!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
