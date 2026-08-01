// Campos de "data pura" (dueDate, issueDate) são armazenados como meia-noite
// UTC — toda comparação de dia aqui usa os getters/setters *UTC* do Date,
// nunca os locais (setHours/getDate puros). Misturar os dois desalinha o
// cálculo em até 1 dia conforme o fuso do servidor (ex.: America/Sao_Paulo,
// UTC-3, "puxava" um vencimento do dia seguinte pra "esta semana").

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
