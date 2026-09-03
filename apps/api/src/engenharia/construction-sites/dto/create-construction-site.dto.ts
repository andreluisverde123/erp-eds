import {
  IsUUID,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { ConstructionStatus } from '../../../../generated/prisma/client';

export class CreateConstructionSiteDto {
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
  @MaxLength(150)
  clientName?: string;

  /// ENDEREÇO DE ENTREGA. Todos opcionais — as obras já cadastradas não têm
  /// endereço, e exigi-lo travaria a edição delas. É o endereço que sai
  /// impresso na ordem de compra para o fornecedor.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressComplement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  /// Só dígitos. O front tira a máscara antes de enviar — o mesmo tratamento
  /// que CNPJ e telefone já recebem (ver `document.util.ts`).
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'O CEP deve ter 8 dígitos.' })
  zipCode?: string;

  @IsOptional()
  @IsString()
  @IsUppercase()
  @Length(2, 2, { message: 'A UF deve ter 2 letras.' })
  state?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de início inválida.' })
  startDate?: string;

  @IsOptional()
  @IsISO8601(undefined, { message: 'Previsão de término inválida.' })
  expectedEndDate?: string;

  @IsOptional()
  @IsEnum(ConstructionStatus, { message: 'Status inválido.' })
  status?: ConstructionStatus;

  /// O responsável como USUÁRIO. Escolhê-lo dá a ele esta obra no Diário —
  /// o vínculo nasce junto, sem uma segunda tela.
  ///
  /// Quando vem, o `responsibleName` é gravado a partir do nome do usuário e o
  /// que o cliente tiver mandado nesse campo é ignorado: dois nomes para a
  /// mesma pessoa divergiriam no primeiro que fosse editado.
  @IsOptional()
  @IsUUID(undefined, { message: 'Responsável inválido.' })
  responsibleId?: string;

  /// Nome digitado à mão. Continua aceito para as obras cujo responsável não é
  /// usuário do sistema — um preposto do cliente, por exemplo.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
