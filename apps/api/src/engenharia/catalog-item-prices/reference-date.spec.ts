import { dateOnlyToDate, dateToDateOnly, isDateOnly, todayIn } from './reference-date';

describe('Datas de referência', () => {
  it('"hoje" é o dia de Brasília, não o do relógio UTC', () => {
    // 23h de 14/09 em Brasília já é 15/09 em UTC.
    const noite = new Date('2026-09-15T02:00:00.000Z');

    expect(todayIn('America/Sao_Paulo', noite)).toBe('2026-09-14');
    expect(todayIn('UTC', noite)).toBe('2026-09-15');
  });

  it('aceita só AAAA-MM-DD de um dia que existe', () => {
    expect(isDateOnly('2026-09-10')).toBe(true);
    expect(isDateOnly('2024-02-29')).toBe(true);

    for (const valor of ['2026-02-30', '10/09/2026', '2026-9-10', '2026-09-10T00:00:00Z', '', 20260910]) {
      expect(isDateOnly(valor)).toBe(false);
    }
  });

  it('ida e volta preservam o dia, sem deslocamento de fuso', () => {
    expect(dateToDateOnly(dateOnlyToDate('2026-09-10'))).toBe('2026-09-10');
  });
});
