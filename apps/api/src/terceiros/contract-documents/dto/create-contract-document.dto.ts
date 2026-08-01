import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateContractDocumentDto {
  @IsUUID(undefined, { message: 'Contrato inválido.' })
  contractId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome do documento é obrigatório.' })
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de emissão inválida.' })
  issueDate?: string;

  @IsISO8601(undefined, { message: 'Data de validade inválida.' })
  expiresAt!: string;
}
