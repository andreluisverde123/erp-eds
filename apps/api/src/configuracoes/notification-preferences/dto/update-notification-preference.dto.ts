import { IsBoolean } from 'class-validator';

/// Só Sistema/Email são configuráveis por aqui. WhatsApp/Push já têm coluna
/// no banco (estrutura preparatória) mas nenhuma integração real de envio
/// existe ainda — por isso ficam de fora deste DTO por enquanto.
export class UpdateNotificationPreferenceDto {
  @IsBoolean({ message: 'Valor inválido.' })
  channelSystem!: boolean;

  @IsBoolean({ message: 'Valor inválido.' })
  channelEmail!: boolean;
}
