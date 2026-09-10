import { IsInt, IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator';

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

  /// CUSTO DO EMPREGADOR. Os três são opcionais e ausência significa
  /// DESCONHECIDO — o relatório de custo marca o mês como parcial em vez de
  /// tratar como zero. Valores efetivos: o ERP não calcula percentual legal.
  @IsOptional()
  @IsNumber({}, { message: 'Encargos patronais inválidos.' })
  @Min(0, { message: 'Os encargos não podem ser negativos.' })
  @Max(999_999_999.99, { message: 'Encargos excedem o limite permitido.' })
  employerCharges?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Benefícios inválidos.' })
  @Min(0, { message: 'Os benefícios não podem ser negativos.' })
  @Max(999_999_999.99, { message: 'Benefícios excedem o limite permitido.' })
  benefits?: number;

  /// Provisão de 13º e férias DO MÊS. Mensal porque a proporcionalidade sai de
  /// graça: cada mês carrega a sua fração e é rateado com os dias daquele mês.
  @IsOptional()
  @IsNumber({}, { message: 'Provisões inválidas.' })
  @Min(0, { message: 'As provisões não podem ser negativas.' })
  @Max(999_999_999.99, { message: 'Provisões excedem o limite permitido.' })
  provisions?: number;
}
