import { IsInt, IsNumber, IsPositive, IsUUID, Max, Min } from 'class-validator';

export class CreatePayslipDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  @IsInt()
  @Min(2000, { message: 'Ano de referência inválido.' })
  @Max(2100, { message: 'Ano de referência inválido.' })
  referenceYear!: number;

  @IsInt()
  @Min(1, { message: 'Mês de referência inválido.' })
  @Max(12, { message: 'Mês de referência inválido.' })
  referenceMonth!: number;

  @IsNumber({}, { message: 'Salário bruto inválido.' })
  @IsPositive({ message: 'O salário bruto deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Salário bruto excede o limite permitido.' })
  grossSalary!: number;

  @IsNumber({}, { message: 'Descontos inválidos.' })
  @Min(0, { message: 'Os descontos não podem ser negativos.' })
  @Max(999_999_999.99, { message: 'Descontos excedem o limite permitido.' })
  deductions!: number;

  @IsNumber({}, { message: 'Salário líquido inválido.' })
  @IsPositive({ message: 'O salário líquido deve ser maior que zero.' })
  @Max(999_999_999.99, { message: 'Salário líquido excede o limite permitido.' })
  netSalary!: number;
}
