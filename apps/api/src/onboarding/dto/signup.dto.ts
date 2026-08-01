import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/// Cadastro self-service. Os dados fiscais (CNPJ, razão social, endereço,
/// inscrição estadual) NÃO estão aqui de propósito: eles só importam na hora
/// de cobrar/emitir nota, e exigi-los na porta de entrada é atrito puro num
/// trial. Todos já são editáveis em Configurações > Empresa.
export class SignupDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email!: string;

  // Mesma regra do cadastro de usuário feito pelo admin (`create-user.dto.ts`).
  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'A senha deve conter ao menos uma letra e um número.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe o nome da construtora.' })
  @MaxLength(120)
  companyName!: string;

  @IsBoolean()
  @Equals(true, { message: 'É preciso aceitar os termos de uso para criar a conta.' })
  acceptedTerms!: boolean;
}
