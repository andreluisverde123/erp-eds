export function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function formatCurrency(value: unknown): string {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
