/// Datas de referência de preço: DIA, sem hora, como texto `AAAA-MM-DD` — o
/// mesmo formato que a API recebe e devolve. Nunca passam por `Date`, que
/// traria o fuso do navegador junto e mudaria o dia perto da meia-noite.

/// "Hoje" em Brasília, que é o dia que a API usa para recusar data futura.
export function todayInSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/// "2026-09-10" → "10/09/2026", só trocando a ordem.
export function formatDateOnly(valor: string): string {
  const [ano, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${ano}`;
}
