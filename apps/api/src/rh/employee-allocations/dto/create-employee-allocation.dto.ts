import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class CreateEmployeeAllocationDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  @IsISO8601(undefined, { message: 'Data de início inválida.' })
  startDate!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de fim inválida.' })
  endDate?: string;
}
