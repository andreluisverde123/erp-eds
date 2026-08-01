import { useFinanceiroIndicators } from '../hooks/use-indicators';
import { IndicatorBarChart } from './indicator-bar-chart';
import { IndicatorLineChart } from './indicator-line-chart';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function FinanceiroIndicators() {
  const { data, isLoading } = useFinanceiroIndicators();

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IndicatorBarChart
          title="Contas pagas x em aberto"
          data={data.paidVsOpen}
          valueFormatter={formatCurrency}
        />
        <IndicatorBarChart
          title="Despesas por obra"
          data={data.expensesBySite}
          valueFormatter={formatCurrency}
          horizontal
        />
      </div>

      <IndicatorLineChart
        title="Fluxo financeiro (pagamentos, últimos 6 meses)"
        data={data.cashFlow}
        valueFormatter={formatCurrency}
      />
    </div>
  );
}
