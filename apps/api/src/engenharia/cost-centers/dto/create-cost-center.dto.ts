import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCostCenterDto {
  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório.' })
  @MaxLength(30)
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /// Opcional: o centro de custo é o destino de uma compra, e nem todo destino
  /// é obra — "Escritório" e "Fazenda" existem soltos, sem obra vinculada.
  @IsOptional()
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId?: string;
}
