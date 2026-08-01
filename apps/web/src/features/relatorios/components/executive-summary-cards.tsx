import {
  Building2,
  Handshake,
  ShoppingCart,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@repo/ui';

import { useExecutiveSummary } from '../hooks/use-executive-summary';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface SummaryCardDef {
  title: string;
  value: string;
  icon: LucideIcon;
}

export function ExecutiveSummaryCards() {
  const { data: summary, isLoading } = useExecutiveSummary();

  const cards: SummaryCardDef[] = summary
    ? [
        { title: 'Obras Ativas', value: String(summary.activeConstructionSites), icon: Building2 },
        {
          title: 'Compras do Mês',
          value: `${formatCurrency(summary.monthlyPurchases.totalAmount)} (${summary.monthlyPurchases.count})`,
          icon: ShoppingCart,
        },
        {
          title: 'Contas a Pagar',
          value: formatCurrency(summary.accountsPayable.totalOpen),
          icon: Wallet,
        },
        { title: 'Funcionários Ativos', value: String(summary.activeEmployees), icon: UserRound },
        {
          title: 'Empresas Terceirizadas',
          value: String(summary.activeContractors),
          icon: Handshake,
        },
        { title: 'Contratos Vencendo', value: String(summary.expiringContracts), icon: Users },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {isLoading &&
        Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Carregando...</span>
                <span className="text-2xl font-semibold tracking-tight text-foreground/20">—</span>
              </div>
            </CardContent>
          </Card>
        ))}

      {cards.map(({ title, value, icon: Icon }) => (
        <Card key={title}>
          <CardContent className="flex items-start justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">{title}</span>
              <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
