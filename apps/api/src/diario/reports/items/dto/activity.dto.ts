import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityDto {
  /// Único campo obrigatório da atividade. Local e observação são contexto;
  /// sem a descrição não há o que registrar.
  @IsString()
  @IsNotEmpty({ message: 'Descreva a atividade.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'O local deve ter no máximo 120 caracteres.' })
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;

  /// `position` NÃO entra: a ordem é atribuída pelo servidor (última da lista).
  /// Aceitá-la do cliente permitiria duas atividades na mesma posição e uma
  /// lista cuja ordem depende de quem salvou por último.
}

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Descreva a atividade.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'O local deve ter no máximo 120 caracteres.' })
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'As observações devem ter no máximo 500 caracteres.' })
  notes?: string;
}
