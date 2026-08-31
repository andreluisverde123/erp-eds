import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/// Limite superior das quantidades. Não é frescura: sem teto, um zero a mais
/// digitado no celular vira "8000 pedreiros" e contamina o total da obra sem
/// nada reclamar. Nenhum canteiro tem mil pessoas de uma função só.
const QUANTIDADE_MAXIMA = 999;

/// Espaços de sobra vindos do teclado do celular quebrariam a unicidade da
/// função: "Pedreiro" e "Pedreiro " passariam como duas funções diferentes.
const normalizarTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateLaborDto {
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe a função.' })
  @MaxLength(80, { message: 'A função deve ter no máximo 80 caracteres.' })
  role!: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: `A quantidade deve ser no máximo ${QUANTIDADE_MAXIMA}.` })
  quantity!: number;
}

/// Atualização parcial: a tela edita a quantidade sem reenviar a função, e
/// corrige a função sem reenviar a quantidade.
export class UpdateLaborDto {
  @IsOptional()
  @Transform(normalizarTexto)
  @IsString()
  @IsNotEmpty({ message: 'Informe a função.' })
  @MaxLength(80, { message: 'A função deve ter no máximo 80 caracteres.' })
  role?: string;

  @IsOptional()
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  @Max(QUANTIDADE_MAXIMA, { message: `A quantidade deve ser no máximo ${QUANTIDADE_MAXIMA}.` })
  quantity?: number;
}
