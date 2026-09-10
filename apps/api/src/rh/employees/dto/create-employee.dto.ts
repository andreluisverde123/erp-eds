import {
  IsEnum,
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

import { CompensationType, EmploymentType } from '../../../../generated/prisma/client';

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

  /// Vínculo e remuneração são opcionais no contrato da API para não quebrar
  /// nenhum cliente existente: quem não informa cai no mesmo default do schema
  /// — próprio e CLT —, que descreve todo colaborador já cadastrado.
  @IsOptional()
  @IsEnum(EmploymentType, { message: 'Tipo de vínculo inválido.' })
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(CompensationType, { message: 'Tipo de remuneração inválido.' })
  compensationType?: CompensationType;

  /// A obrigatoriedade da diária NÃO é decidida aqui. Ela depende do tipo de
  /// remuneração, e na edição depende também do que já está gravado — regra
  /// que `resolverRemuneracao` concentra, para não existir em dois lugares
  /// com chance de divergirem.
  @IsOptional()
  @IsNumber({}, { message: 'Valor da diária inválido.' })
  @Max(999_999_999.99, { message: 'Valor da diária excede o limite permitido.' })
  dailyRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Salário base inválido.' })
  @IsPositive({ message: 'O salário base deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Salário base excede o limite permitido.' })
  baseSalary?: number;
}
