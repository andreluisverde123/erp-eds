import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'Informe a senha atual.' })
  currentPassword!: string;

  // Mesma regra do cadastro e da criação de usuário pelo admin.
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter ao menos 8 caracteres.' })
  @MaxLength(72, { message: 'A nova senha deve ter no máximo 72 caracteres.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'A nova senha deve conter ao menos uma letra e um número.',
  })
  newPassword!: string;
}
