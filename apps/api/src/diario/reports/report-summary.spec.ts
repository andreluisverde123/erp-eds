import { buildReportSummary } from './report-summary';

const VAZIO = {
  labor: [],
  equipment: [],
  activities: [],
  occurrences: [],
  materials: [],
  media: [],
  workStartMinutes: null,
  workBreakStartMinutes: null,
  workBreakEndMinutes: null,
  workEndMinutes: null,
  scheduleNotes: null,
  morningWeather: null,
  afternoonWeather: null,
  weatherNotes: null,
  notes: null,
};

describe('buildReportSummary', () => {
  it('soma o efetivo a partir das linhas — não existe total armazenado', () => {
    const resumo = buildReportSummary({
      ...VAZIO,
      labor: [{ quantity: 8 }, { quantity: 6 }, { quantity: 2 }],
    });

    expect(resumo.labor).toEqual({ roles: 3, workers: 16 });
  });

  it('conta equipamentos por linha e por unidade', () => {
    const resumo = buildReportSummary({
      ...VAZIO,
      equipment: [{ quantity: 1 }, { quantity: 4 }],
    });

    expect(resumo.equipment).toEqual({ items: 2, units: 5 });
  });

  it('conta atividades, ocorrências e movimentações de material', () => {
    const resumo = buildReportSummary({
      ...VAZIO,
      activities: [{}, {}, {}],
      occurrences: [{}],
      materials: [{}, {}],
    });

    expect(resumo.activities).toBe(3);
    expect(resumo.occurrences).toBe(1);
    expect(resumo.materials).toBe(2);
  });

  it('conta fotos e vídeos separadamente — a tela tem uma seção para cada', () => {
    const resumo = buildReportSummary({
      ...VAZIO,
      media: [{ type: 'PHOTO' }, { type: 'PHOTO' }, { type: 'VIDEO' }],
    });

    expect(resumo.photos).toBe(2);
    expect(resumo.videos).toBe(1);
  });

  it('conta REGISTROS de material, sem somar quantidades', () => {
    // Somar 50 sacos com 2,5 m³ não significa nada, e um "total de materiais"
    // seria o primeiro passo para o RDO virar controle de estoque paralelo.
    const resumo = buildReportSummary({
      ...VAZIO,
      materials: [{ quantity: 50 }, { quantity: 1200 }],
    });

    expect(resumo.materials).toBe(2);
    expect(resumo).not.toHaveProperty('materialsTotal');
  });

  it('marca o horário como preenchido com QUALQUER campo', () => {
    // Exigir os quatro marcaria como vazia uma seção onde já há informação — e
    // o término é o último a entrar, no fim do dia.
    expect(buildReportSummary({ ...VAZIO, workStartMinutes: 420 }).hasSchedule).toBe(true);
    expect(buildReportSummary({ ...VAZIO, scheduleNotes: 'Começou às 8h.' }).hasSchedule).toBe(
      true,
    );
    expect(buildReportSummary(VAZIO).hasSchedule).toBe(false);
  });

  it('marca o clima como preenchido com um período só', () => {
    expect(buildReportSummary({ ...VAZIO, morningWeather: 'SUNNY' }).hasWeather).toBe(true);
    expect(buildReportSummary(VAZIO).hasWeather).toBe(false);
  });

  it('não considera preenchido um texto só de espaços', () => {
    expect(buildReportSummary({ ...VAZIO, notes: '   ' }).hasNotes).toBe(false);
    expect(buildReportSummary({ ...VAZIO, notes: 'Equipe normal.' }).hasNotes).toBe(true);
  });

  it('devolve tudo zerado num relatório recém-criado', () => {
    expect(buildReportSummary(VAZIO)).toEqual({
      labor: { roles: 0, workers: 0 },
      equipment: { items: 0, units: 0 },
      activities: 0,
      occurrences: 0,
      materials: 0,
      photos: 0,
      videos: 0,
      hasSchedule: false,
      hasWeather: false,
      hasNotes: false,
    });
  });
});
