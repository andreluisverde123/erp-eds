import { IsBoolean } from 'class-validator';

/// Corpo do interruptor do Diário de Obras.
///
/// Um campo só, e obrigatório: o cliente diz o estado desejado em vez de pedir
/// "inverta". Assim dois toques rápidos no mesmo botão não se cancelam, e a
/// segunda requisição não desfaz a primeira por chegar fora de ordem.
export class UpdateUserDiarioDto {
  @IsBoolean({ message: 'Informe se o Diário de Obras fica liberado para este usuário.' })
  diarioEnabled!: boolean;
}
