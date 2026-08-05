import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSystemUserDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(150, { message: 'O nome deve ter no máximo 150 caracteres.' })
  name!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email!: string;

  /// Sempre o ID do perfil — o nome do perfil nunca é aceito nem persistido
  /// no usuário: quem renomeia um perfil não deve quebrar o vínculo.
  @IsUUID(undefined, { message: 'Perfil inválido.' })
  roleId!: string;

  /// Ativo por padrão. Um usuário criado inativo já nasce sem acesso — útil
  /// para preparar o cadastro antes da data de entrada.
  @IsOptional()
  @IsBoolean({ message: 'Status inválido.' })
  isActive?: boolean;
}
