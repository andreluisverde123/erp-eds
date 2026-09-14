/// Datas de referência de preço: DIA, sem hora.
///
/// Trafegam como texto `AAAA-MM-DD` e são gravadas em coluna `DATE`. Nada de
/// `Date` com hora no meio do caminho: "10/09/2026" guardado como meia-noite
/// de Brasília vira 09/09 em UTC, e o preço passaria a valer um dia antes.

/// O ERP é de uma empresa só, em Brasília (`Company.timezone` tem o mesmo
/// valor). "Hoje" é o dia dela, não o do servidor — às 22h de Brasília o
/// relógio UTC já está no dia seguinte.
export const REFERENCE_TIME_ZONE = 'America/Sao_Paulo';

const AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone: string = REFERENCE_TIME_ZONE, agora: Date = new Date()): string {
  // `en-CA` formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/// `AAAA-MM-DD` de um dia que existe: "2026-02-30" é recusado.
export function isDateOnly(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !AAAA_MM_DD.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

export function dateOnlyToDate(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

/// O inverso, para responder. A coluna `DATE` chega do Prisma como meia-noite
/// UTC, então a parte da data do ISO é o dia gravado.
export function dateToDateOnly(data: Date): string {
  return data.toISOString().slice(0, 10);
}
