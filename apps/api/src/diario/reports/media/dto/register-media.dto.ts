import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/// Metadados que acompanham o arquivo no multipart.
///
/// É deliberadamente MINÚSCULO. Tipo, MIME, tamanho e dimensões saem do
/// próprio arquivo no servidor — aceitar qualquer um deles do cliente seria
/// deixar a validação de segurança nas mãos de quem envia. O que sobra é o que
/// só o navegador sabe e que não decide nada.
export class RegisterMediaDto {
  /// Duração do vídeo, que o `<video>` do navegador mede ao carregar o arquivo.
  ///
  /// Ler isso no servidor exigiria um parser de contêiner — superfície de
  /// ataque bem maior que o valor de saber quantos segundos o clipe tem. É
  /// metadado de exibição: mentir aqui só faz a tela mostrar um número errado.
  ///
  /// Vem como string no multipart, daí o `Type(() => Number)`.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Duração inválida.' })
  @Min(0, { message: 'Duração inválida.' })
  // 24 horas. Um teto qualquer, só para o número não ser absurdo no banco.
  @Max(86_400, { message: 'Duração inválida.' })
  durationSeconds?: number;
}
