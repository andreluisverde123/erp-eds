/// Resumo de preenchimento do RDO — o que a lista de seções mostra sem abrir
/// nenhuma delas ("Mão de obra · 5 funções · 18 pessoas").
///
/// TUDO aqui é derivado das linhas, nada é armazenado. É a mesma regra que
/// impede uma coluna `totalWorkers`: dois números para a mesma verdade
/// divergem no primeiro item editado, e o que diverge é sempre o que ninguém
/// está olhando.
///
/// O cálculo mora no backend porque o resumo aparece em duas telas (a lista de
/// seções e o cabeçalho) e vai aparecer no PDF. Três implementações da mesma
/// soma é como "18 pessoas" e "16 pessoas" acabam na mesma página.
export interface DailyReportSummary {
  labor: { roles: number; workers: number };
  equipment: { items: number; units: number };
  activities: number;
  occurrences: number;
  /// Quantas movimentações de material o dia teve.
  ///
  /// Contagem de REGISTROS, e nada além disso. Nenhum saldo, nenhum total por
  /// unidade, nenhum acumulado: somar 50 sacos com 2,5 m³ não significa nada, e
  /// um "total de materiais" seria o primeiro passo para o RDO virar um
  /// controle de estoque paralelo ao que Compras já faz.
  materials: number;
  /// Evidência visual, contada por tipo — a tela tem uma seção para cada.
  photos: number;
  videos: number;
  /// Preenchimento das seções sem lista, para a tela marcar o "✓".
  hasSchedule: boolean;
  hasWeather: boolean;
  hasNotes: boolean;
}

interface ContadoresInput {
  labor: { quantity: number }[];
  equipment: { quantity: number }[];
  activities: unknown[];
  occurrences: unknown[];
  materials: unknown[];
  media: { type: 'PHOTO' | 'VIDEO' }[];
  workStartMinutes: number | null;
  workBreakStartMinutes: number | null;
  workBreakEndMinutes: number | null;
  workEndMinutes: number | null;
  scheduleNotes: string | null;
  morningWeather: string | null;
  afternoonWeather: string | null;
  weatherNotes: string | null;
  notes: string | null;
}

const preenchido = (valor: string | null): boolean => Boolean(valor && valor.trim().length > 0);

export function buildReportSummary(report: ContadoresInput): DailyReportSummary {
  return {
    labor: {
      roles: report.labor.length,
      workers: report.labor.reduce((total, linha) => total + linha.quantity, 0),
    },
    equipment: {
      items: report.equipment.length,
      units: report.equipment.reduce((total, linha) => total + linha.quantity, 0),
    },
    activities: report.activities.length,
    occurrences: report.occurrences.length,
    materials: report.materials.length,
    photos: report.media.filter((arquivo) => arquivo.type === 'PHOTO').length,
    videos: report.media.filter((arquivo) => arquivo.type === 'VIDEO').length,
    // QUALQUER campo do horário conta como "começou a preencher". Exigir os
    // quatro marcaria como vazia uma seção onde já há informação — e o RDO é
    // preenchido ao longo do dia, com o término entrando por último.
    hasSchedule:
      report.workStartMinutes !== null ||
      report.workBreakStartMinutes !== null ||
      report.workBreakEndMinutes !== null ||
      report.workEndMinutes !== null ||
      preenchido(report.scheduleNotes),
    hasWeather:
      report.morningWeather !== null ||
      report.afternoonWeather !== null ||
      preenchido(report.weatherNotes),
    hasNotes: preenchido(report.notes),
  };
}
