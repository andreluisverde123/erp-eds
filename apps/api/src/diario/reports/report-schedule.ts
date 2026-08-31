import { daysBetween } from './report-date';

/// Prazo da obra visto DA DATA DESTE RELATÓRIO — não de hoje.
///
/// A diferença é o ponto: reabrir o RDO de 12/03 em setembro precisa mostrar o
/// prazo como ele estava em 12/03, senão o documento muda de conteúdo depois de
/// escrito. Um diário de obra é registro histórico; "faltam 40 dias" tem que
/// significar o que significava no dia.
export interface ReportSchedule {
  /// Datas da obra, repetidas aqui para a tela não precisar cruzar dois
  /// objetos só para exibir a linha do prazo.
  startDate: Date | null;
  expectedEndDate: Date | null;
  /// Prazo contratual em dias (início → término previsto).
  totalDays: number | null;
  /// Dias decorridos do início até a data deste relatório. Negativo é
  /// impossível na prática (a obra não tinha começado), então vira `0`.
  elapsedDays: number | null;
  /// Dias da data deste relatório até o término previsto. NEGATIVO quando o
  /// prazo já venceu — e é para ficar negativo mesmo: zerar esconderia
  /// exatamente a informação que importa, o atraso.
  remainingDays: number | null;
}

/// Calculado no backend, e só lá. O frontend recebe os números prontos: uma
/// segunda implementação no navegador é como "prazo decorrido" passa a ter
/// dois valores diferentes na mesma tela quando uma das duas esquecer do fuso.
export function buildReportSchedule(
  site: { startDate: Date | null; expectedEndDate: Date | null },
  reportDate: Date,
): ReportSchedule {
  const { startDate, expectedEndDate } = site;

  return {
    startDate,
    expectedEndDate,
    totalDays:
      startDate && expectedEndDate ? Math.max(0, daysBetween(startDate, expectedEndDate)) : null,
    elapsedDays: startDate ? Math.max(0, daysBetween(startDate, reportDate)) : null,
    remainingDays: expectedEndDate ? daysBetween(reportDate, expectedEndDate) : null,
  };
}
