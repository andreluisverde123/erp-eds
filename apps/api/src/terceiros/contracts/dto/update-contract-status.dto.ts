import { IsIn } from 'class-validator';

export class UpdateContractStatusDto {
  /// Único destino válido é CANCELLED (encerramento manual antes do prazo)
  /// — ver ContractsService.updateStatus.
  @IsIn(['CANCELLED'], { message: 'Status inválido.' })
  status!: 'CANCELLED';
}
