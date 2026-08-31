import { BadRequestException } from '@nestjs/common';

const HORA_MINUTO = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTOS_POR_DIA = 24 * 60;

/// Converte `HH:MM` em minutos desde a meia-noite.
///
/// A API fala `"07:00"` porque é isso que um `<input type="time">` manda e o
/// que uma pessoa lê; o banco guarda `420` porque é isso que soma, compara e
/// ordena. A conversão vive aqui, num lugar só, e é a razão de o resto do
/// código nunca precisar pensar no assunto.
export function parseTimeOfDay(value: string, campo: string): number {
  const casa = HORA_MINUTO.exec(value);
  if (!casa) {
    throw new BadRequestException(`${campo}: informe um horário no formato HH:MM.`);
  }

  return Number(casa[1]) * 60 + Number(casa[2]);
}

/// Minutos desde a meia-noite de volta para `HH:MM`. Devolve `null` para
/// `null` — o horário não preenchido continua não preenchido na resposta, em
/// vez de virar "00:00", que significaria meia-noite.
export function formatTimeOfDay(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;

  const hora = Math.floor(minutes / 60);
  const minuto = minutes % 60;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}
