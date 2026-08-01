import { AlertCircle, CalendarClock, CheckCircle2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@repo/ui';

import type { AccountPayableSummary } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountPayablesSummaryCards({ summary }: { summary: AccountPayableSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryStat
        icon={Wallet}
        label="Total em Aberto"
        value={formatCurrency(summary.totalOpen)}
      />
      <SummaryStat
        icon={CheckCircle2}
        label="Total Pago"
        value={formatCurrency(summary.totalPaid)}
      />
      <SummaryStat
        icon={AlertCircle}
        label="Vencendo Hoje"
        value={formatCurrency(summary.dueToday)}
      />
      <SummaryStat
        icon={CalendarClock}
        label="Vencendo na Semana"
        value={formatCurrency(summary.dueThisWeek)}
      />
    </div>
  );
}
