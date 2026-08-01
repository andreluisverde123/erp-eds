export interface ChartPoint {
  label: string;
  value: number;
  count?: number;
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/// Agrega uma janela de N meses terminando no mês atual, mesmo sem dados em
/// todo mês (mês sem lançamento aparece com valor 0 — importante pro
/// gráfico não "pular" meses vazios).
export function monthsWindow(
  monthsBack: number,
  from: Date = new Date(),
): { start: Date; buckets: { key: string; label: string }[] } {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const buckets: { key: string; label: string }[] = [];
  for (let i = monthsBack; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: `${MONTH_LABELS[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(2)}`,
    });
  }
  return {
    start: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsBack, 1)),
    buckets,
  };
}

export function bucketByMonth<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
  monthsBack = 5,
): ChartPoint[] {
  const { buckets } = monthsWindow(monthsBack);
  const totals = new Map(buckets.map((bucket) => [bucket.key, { value: 0, count: 0 }]));

  for (const item of items) {
    const date = getDate(item);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = totals.get(key);
    if (bucket) {
      bucket.value += getValue(item);
      bucket.count += 1;
    }
  }

  return buckets.map((bucket) => ({ label: bucket.label, ...totals.get(bucket.key)! }));
}

export function daysAgoStart(daysBack: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - daysBack);
  return result;
}

export function bucketByDay<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
  daysBack = 29,
): ChartPoint[] {
  const buckets: { key: string; label: string }[] = [];
  for (let i = daysBack; i >= 0; i -= 1) {
    const date = daysAgoStart(i);
    buckets.push({
      key: date.toISOString().slice(0, 10),
      label: `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    });
  }
  const totals = new Map(buckets.map((bucket) => [bucket.key, { value: 0, count: 0 }]));

  for (const item of items) {
    const key = getDate(item).toISOString().slice(0, 10);
    const bucket = totals.get(key);
    if (bucket) {
      bucket.value += getValue(item);
      bucket.count += 1;
    }
  }

  return buckets.map((bucket) => ({ label: bucket.label, ...totals.get(bucket.key)! }));
}
