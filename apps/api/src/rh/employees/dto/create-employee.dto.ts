import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

/// Sem campo `status` — todo funcionário sempre nasce ACTIVE (default do
/// schema). Mudar de status é uma ação de edição explícita, só existe em
/// `UpdateEmployeeDto`, nunca no create.
export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150)
  name!: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'O CPF deve conter 11 dígitos numéricos.' })
  cpf!: string;

  @IsString()
  @IsNotEmpty({ message: 'O cargo é obrigatório.' })
  @MaxLength(100)
  position!: string;

  @IsISO8601(undefined, { message: 'Data de admissão inválida.' })
  hireDate!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de desligamento inválida.' })
  terminationDate?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Salário base inválido.' })
  @IsPositive({ message: 'O salário base deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Salário base excede o limite permitido.' })
  baseSalary?: number;
}
