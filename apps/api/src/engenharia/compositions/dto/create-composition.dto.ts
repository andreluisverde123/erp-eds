import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCanonicalUnit } from '../../catalog-items/is-canonical-unit.validator';

/// Sem `code`: sequencial e gerado no servidor (`COMP-0001`), como no catálogo.
/// Sem custo nenhum: o custo unitário é a soma dos itens, calculada a cada
/// leitura.
export class CreateCompositionDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150, { message: 'Máximo de 150 caracteres.' })
  name!: string;

  /// A unidade do SERVIÇO produzido (M2 para alvenaria). Os coeficientes dos
  /// itens são "quanto do insumo por uma unidade desta".
  @IsCanonicalUnit()
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo de 500 caracteres.' })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: 'Situação inválida.' })
  active?: boolean;
}
