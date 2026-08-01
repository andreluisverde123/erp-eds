import { ArrowRight } from 'lucide-react';

import type { FieldChanges } from '../field-changes';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }
  }
  return String(value);
}

export function FieldDiff({ changes }: { changes: FieldChanges }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3">
      {entries.map(([field, { from, to }]) => (
        <div key={field} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="min-w-24 font-medium text-foreground">{formatFieldLabel(field)}</span>
          <span className="text-muted-foreground line-through">{formatValue(from)}</span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
          <span className="text-foreground">{formatValue(to)}</span>
        </div>
      ))}
    </div>
  );
}
