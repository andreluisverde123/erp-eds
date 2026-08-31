import { BadRequestException } from '@nestjs/common';

import { formatTimeOfDay, parseTimeOfDay } from './report-time';
import { buildWorkSchedule } from './work-schedule';

describe('parseTimeOfDay', () => {
  it.each([
    ['00:00', 0],
    ['07:00', 420],
    ['12:30', 750],
    ['23:59', 1439],
  ])('%s vira %i minutos', (texto, minutos) => {
    expect(parseTimeOfDay(texto, 'Início')).toBe(minutos);
  });

  it.each(['24:00', '7:00', '07:60', '0700', 'manhã', ''])('recusa %p', (texto) => {
    expect(() => parseTimeOfDay(texto, 'Início')).toThrow(BadRequestException);
  });

  it('nomeia o campo na mensagem — "horário inválido" sozinho não diz qual', () => {
    expect(() => parseTimeOfDay('99:99', 'Término')).toThrow(/Término/);
  });
});

describe('formatTimeOfDay', () => {
  it.each([
    [0, '00:00'],
    [420, '07:00'],
    [1439, '23:59'],
  ])('%i minutos vira %s', (minutos, texto) => {
    expect(formatTimeOfDay(minutos)).toBe(texto);
  });

  it('mantém o não preenchido como nulo — 00:00 significaria meia-noite', () => {
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay(undefined)).toBeNull();
  });
});

const VAZIO = {
  workStartMinutes: null,
  workBreakStartMinutes: null,
  workBreakEndMinutes: null,
  workEndMinutes: null,
};

describe('buildWorkSchedule', () => {
  it('converte a jornada inteira para minutos', () => {
    const horario = buildWorkSchedule(
      {
        workStartTime: '07:00',
        workBreakStartTime: '12:00',
        workBreakEndTime: '13:00',
        workEndTime: '17:00',
      },
      VAZIO,
    );

    expect(horario).toEqual({
      workStartMinutes: 420,
      workBreakStartMinutes: 720,
      workBreakEndMinutes: 780,
      workEndMinutes: 1020,
    });
  });

  it('ignora os campos que não vieram — o PATCH manda só o que mudou', () => {
    expect(buildWorkSchedule({ workEndTime: '17:00' }, VAZIO)).toEqual({
      workEndMinutes: 1020,
    });
  });

  it('aceita nulo e string vazia como "apague este horário"', () => {
    const atual = { ...VAZIO, workEndMinutes: 1020 };

    expect(buildWorkSchedule({ workEndTime: null }, atual)).toEqual({ workEndMinutes: null });
    expect(buildWorkSchedule({ workEndTime: '' }, atual)).toEqual({ workEndMinutes: null });
  });

  it('recusa término anterior ao início', () => {
    expect(() =>
      buildWorkSchedule({ workStartTime: '07:00', workEndTime: '05:00' }, VAZIO),
    ).toThrow(BadRequestException);
  });

  it('valida contra o que JÁ ESTAVA gravado, não só contra o que chegou', () => {
    // O caso que uma validação campo-a-campo deixa passar: "05:00" é um
    // horário perfeitamente válido; o que não é válido é ele ser o término de
    // uma jornada que começou às 07:00 e está gravada no banco.
    const jaGravado = { ...VAZIO, workStartMinutes: 420 };

    expect(() => buildWorkSchedule({ workEndTime: '05:00' }, jaGravado)).toThrow(
      BadRequestException,
    );
  });

  it('recusa retorno do intervalo anterior à saída', () => {
    expect(() =>
      buildWorkSchedule({ workBreakStartTime: '13:00', workBreakEndTime: '12:00' }, VAZIO),
    ).toThrow(BadRequestException);
  });

  it('recusa intervalo fora da jornada', () => {
    const jornada = { ...VAZIO, workStartMinutes: 420, workEndMinutes: 1020 };

    expect(() => buildWorkSchedule({ workBreakStartTime: '06:00' }, jornada)).toThrow(
      BadRequestException,
    );
    expect(() => buildWorkSchedule({ workBreakEndTime: '18:00' }, jornada)).toThrow(
      BadRequestException,
    );
  });

  it('aceita o intervalo antes de o término existir — o RDO é preenchido ao longo do dia', () => {
    const soComeco = { ...VAZIO, workStartMinutes: 420 };

    expect(() =>
      buildWorkSchedule({ workBreakStartTime: '12:00', workBreakEndTime: '13:00' }, soComeco),
    ).not.toThrow();
  });

  it('aceita jornada parcial — nada é obrigatório', () => {
    expect(() => buildWorkSchedule({ workStartTime: '07:00' }, VAZIO)).not.toThrow();
    expect(() => buildWorkSchedule({}, VAZIO)).not.toThrow();
  });
});
