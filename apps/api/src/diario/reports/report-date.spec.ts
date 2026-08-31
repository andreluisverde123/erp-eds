import { BadRequestException } from '@nestjs/common';

import { daysBetween, parseReportDate, weekdayOf } from './report-date';

const HOJE = new Date('2026-08-30T12:00:00.000Z');

describe('parseReportDate', () => {
  it('converte AAAA-MM-DD na meia-noite UTC que a coluna DATE guarda', () => {
    expect(parseReportDate('2026-08-30', HOJE).toISOString()).toBe('2026-08-30T00:00:00.000Z');
  });

  it('recusa data que não existe no calendário', () => {
    // `new Date('2026-02-31')` não explode: ele "conserta" para 03/03. Sem a
    // conferência, o usuário pediria 31/02 e receberia um RDO de 03/03.
    expect(() => parseReportDate('2026-02-31', HOJE)).toThrow(BadRequestException);
  });

  it('aceita 29/02 em ano bissexto', () => {
    expect(parseReportDate('2024-02-29', HOJE).toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('recusa formato com hora', () => {
    expect(() => parseReportDate('2026-08-30T10:00:00Z', HOJE)).toThrow(BadRequestException);
  });

  it('recusa data no futuro', () => {
    expect(() => parseReportDate('2026-09-05', HOJE)).toThrow(BadRequestException);
  });

  it('tolera o dia seguinte — às 21h de Brasília o servidor já virou em UTC', () => {
    const noiteEmBrasilia = new Date('2026-08-31T00:30:00.000Z'); // 21h30 do dia 30 no Brasil
    expect(() => parseReportDate('2026-08-31', noiteEmBrasilia)).not.toThrow();
  });

  it('aceita datas passadas — preencher o RDO de ontem é o caso normal', () => {
    expect(() => parseReportDate('2026-01-15', HOJE)).not.toThrow();
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-08-30', 'Domingo'],
    ['2026-08-31', 'Segunda-feira'],
    ['2026-09-01', 'Terça-feira'],
    ['2026-09-05', 'Sábado'],
  ])('%s cai em %s', (data, dia) => {
    expect(weekdayOf(new Date(`${data}T00:00:00.000Z`))).toBe(dia);
  });
});

describe('daysBetween', () => {
  it('conta dias inteiros entre duas datas puras', () => {
    expect(
      daysBetween(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-31T00:00:00.000Z')),
    ).toBe(30);
  });

  it('atravessa o horário de verão sem perder nem ganhar um dia', () => {
    // A conta é feita em UTC justamente para que mudanças de fuso não
    // desloquem o resultado — um prazo de obra não pode variar em outubro.
    expect(
      daysBetween(new Date('2026-10-01T00:00:00.000Z'), new Date('2026-11-01T00:00:00.000Z')),
    ).toBe(31);
  });

  it('é negativo quando a data final já passou', () => {
    expect(
      daysBetween(new Date('2026-08-30T00:00:00.000Z'), new Date('2026-08-20T00:00:00.000Z')),
    ).toBe(-10);
  });
});
