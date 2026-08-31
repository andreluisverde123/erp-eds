import { buildReportSchedule } from './report-schedule';

const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const OBRA = { startDate: data('2026-01-01'), expectedEndDate: data('2026-12-31') };

describe('buildReportSchedule', () => {
  it('calcula prazo contratual, decorrido e a vencer na data DO RELATÓRIO', () => {
    const prazo = buildReportSchedule(OBRA, data('2026-08-30'));

    expect(prazo.totalDays).toBe(364);
    expect(prazo.elapsedDays).toBe(241);
    expect(prazo.remainingDays).toBe(123);
  });

  it('usa a data do relatório, não a de hoje — o documento não muda depois de escrito', () => {
    const marco = buildReportSchedule(OBRA, data('2026-03-12'));
    const setembro = buildReportSchedule(OBRA, data('2026-09-12'));

    expect(marco.elapsedDays).toBe(70);
    expect(setembro.elapsedDays).toBe(254);
  });

  it('deixa o prazo a vencer NEGATIVO quando já venceu — zerar esconderia o atraso', () => {
    expect(buildReportSchedule(OBRA, data('2027-02-01')).remainingDays).toBe(-32);
  });

  it('não deixa o decorrido negativo antes do início da obra', () => {
    expect(buildReportSchedule(OBRA, data('2025-12-01')).elapsedDays).toBe(0);
  });

  it('devolve nulos quando a obra não tem as datas preenchidas', () => {
    const prazo = buildReportSchedule(
      { startDate: null, expectedEndDate: null },
      data('2026-08-30'),
    );

    expect(prazo).toMatchObject({ totalDays: null, elapsedDays: null, remainingDays: null });
  });

  it('calcula o que dá com apenas uma das datas', () => {
    const prazo = buildReportSchedule(
      { startDate: data('2026-01-01'), expectedEndDate: null },
      data('2026-08-30'),
    );

    expect(prazo.elapsedDays).toBe(241);
    expect(prazo.totalDays).toBeNull();
    expect(prazo.remainingDays).toBeNull();
  });
});
