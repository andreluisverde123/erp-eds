import type { DailyReportStatus } from '../types';

/// Rótulos do ciclo de vida do RDO. Espelham
/// `apps/api/src/diario/reports/daily-report-status.ts` — os dois lados
/// precisam dizer a mesma palavra sobre o mesmo estado.
///
/// A tela do RDO usa o `statusLabel` que vem do backend; esta tabela serve às
/// listas e ao filtro, onde o rótulo aparece sem o relatório inteiro ter sido
/// carregado.
export const REPORT_STATUS_LABEL: Record<DailyReportStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Finalizado',
  APPROVED: 'Aprovado',
};

/// Só o rascunho recebe destaque de "pendente": numa lista lida em movimento,
/// é o único estado que exige ação de quem está olhando. Finalizado é verde
/// porque é o desfecho esperado do dia, não uma situação neutra.
export const REPORT_STATUS_CLASS: Record<DailyReportStatus, string> = {
  DRAFT: 'bg-pending text-pending-foreground',
  SUBMITTED: 'bg-success/10 text-success',
  APPROVED: 'bg-success/10 text-success',
};

export const REPORT_STATUS_ORDER: DailyReportStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED'];

/// Data do relatório sem passar pelo fuso do aparelho. A API manda a data pura
/// como meia-noite UTC; formatá-la em horário local mostraria o dia anterior em
/// todo o Brasil.
export function formatReportDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
}

/// Valor para o `<input type="date">`, que só aceita `AAAA-MM-DD`.
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// Dia da semana da data ESCOLHIDA, antes de o relatório existir.
///
/// Não é duplicação da regra do servidor: o RDO já criado sempre exibe o
/// `weekday` que a API calculou. Aqui não há relatório ainda — e pedir uma
/// ida ao servidor para descobrir que 30/08/2026 é domingo, num aparelho em
/// 4G de canteiro, seria gastar a rede com o calendário gregoriano.
export function weekdayPreview(value: string): string {
  if (!value) return '';
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}
