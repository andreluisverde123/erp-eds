import { BadRequestException } from '@nestjs/common';

import { parseTimeOfDay } from './report-time';

/// Como o horário chega do cliente: quatro strings `HH:MM`, todas opcionais.
export interface WorkScheduleInput {
  workStartTime?: string | null;
  workBreakStartTime?: string | null;
  workBreakEndTime?: string | null;
  workEndTime?: string | null;
}

/// Como ele vai para o banco: quatro inteiros.
export interface WorkScheduleColumns {
  workStartMinutes?: number | null;
  workBreakStartMinutes?: number | null;
  workBreakEndMinutes?: number | null;
  workEndMinutes?: number | null;
}

const CAMPOS = [
  ['workStartTime', 'workStartMinutes', 'Início'],
  ['workBreakStartTime', 'workBreakStartMinutes', 'Início do intervalo'],
  ['workBreakEndTime', 'workBreakEndMinutes', 'Retorno do intervalo'],
  ['workEndTime', 'workEndMinutes', 'Término'],
] as const;

/// Traduz o horário recebido para colunas e valida a coerência entre os
/// quatro campos.
///
/// A validação acontece contra o horário RESULTANTE (o que já estava gravado
/// mais o que veio no PATCH), e não só contra o que chegou. Sem isso, mandar o
/// término sozinho num relatório que já tinha início às 07:00 passaria batido
/// com "término 05:00" — cada campo, isolado, é válido; o conjunto é que não é.
///
/// **Turno virando a meia-noite não é representável.** `end >= start` recusa
/// 22:00 → 06:00. É uma limitação assumida: o diário de obra registra jornada
/// diurna, e aceitar a inversão silenciosamente transformaria todo erro de
/// digitação num dado plausível. Quando houver obra em turno noturno, a saída é
/// uma marcação explícita de "vira o dia", não relaxar a regra.
export function buildWorkSchedule(
  input: WorkScheduleInput,
  atual: WorkScheduleColumns,
): WorkScheduleColumns {
  const colunas: WorkScheduleColumns = {};

  for (const [entrada, coluna, rotulo] of CAMPOS) {
    const valor = input[entrada];
    if (valor === undefined) continue;
    // String vazia e `null` são "apague este horário" — é como o campo é
    // limpo na tela, e recusá-los deixaria o usuário sem como corrigir.
    colunas[coluna] = valor === null || valor === '' ? null : parseTimeOfDay(valor, rotulo);
  }

  const resultante = { ...atual, ...colunas };
  assertCoerente(resultante);

  return colunas;
}

function assertCoerente(horario: WorkScheduleColumns): void {
  const inicio = horario.workStartMinutes ?? null;
  const fim = horario.workEndMinutes ?? null;
  const intervaloInicio = horario.workBreakStartMinutes ?? null;
  const intervaloFim = horario.workBreakEndMinutes ?? null;

  if (inicio !== null && fim !== null && fim < inicio) {
    throw new BadRequestException('O término não pode ser anterior ao início da jornada.');
  }

  if (intervaloInicio !== null && intervaloFim !== null && intervaloFim < intervaloInicio) {
    throw new BadRequestException('O retorno do intervalo não pode ser anterior à saída.');
  }

  // O intervalo só é conferido contra a jornada quando ela está definida dos
  // dois lados — cobrar isso de um relatório com o término ainda em branco
  // impediria de registrar o almoço antes do fim do expediente.
  for (const ponto of [intervaloInicio, intervaloFim]) {
    if (ponto === null) continue;
    if (inicio !== null && ponto < inicio) {
      throw new BadRequestException('O intervalo não pode começar antes da jornada.');
    }
    if (fim !== null && ponto > fim) {
      throw new BadRequestException('O intervalo não pode terminar depois da jornada.');
    }
  }
}
