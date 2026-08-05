import { IsString, MaxLength, MinLength } from 'class-validator';

export class UploadCertificateDto {
  /// Senha do .pfx. Chega por multipart junto do arquivo, é usada para abrir o
  /// certificado e vai cifrada para o banco — nunca é gravada em texto puro,
  /// nunca é devolvida numa resposta e nunca aparece em log.
  @IsString()
  @MinLength(1, { message: 'Informe a senha do certificado.' })
  @MaxLength(200)
  password!: string;
}
