import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/// Transferência de obra.
///
/// Só três informações, porque a operação é uma só: a partir de tal dia, esta
/// pessoa passa a trabalhar naquela obra. A alocação de origem NÃO é informada
/// — o service a descobre, e assim não há como transferir a partir de uma
/// alocação que já foi encerrada ou que é de outra pessoa.
export class TransferEmployeeDto {
  @IsUUID(undefined, { message: 'Funcionário inválido.' })
  employeeId!: string;

  /// Obra de destino.
  @IsUUID(undefined, { message: 'Obra inválida.' })
  constructionSiteId!: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Centro de custo inválido.' })
  costCenterId?: string;

  /// PRIMEIRO dia na obra nova. A alocação anterior é encerrada no dia
  /// imediatamente anterior a este — sem buraco e sem dia em duplicidade.
  @IsISO8601(undefined, { message: 'Data da transferência inválida.' })
  date!: string;
}
