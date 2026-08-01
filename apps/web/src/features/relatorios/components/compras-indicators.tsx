import { Card, CardContent } from '@repo/ui';

import { useComprasIndicators } from '../hooks/use-indicators';
import { IndicatorBarChart } from './indicator-bar-chart';
import { IndicatorLineChart } from './indicator-line-chart';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function ComprasIndicators() {
  const { data, isLoading } = useComprasIndicators();

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Valor médio das compras</span>
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {formatCurrency(data.averageValue)}
            </span>
            <span className="text-xs text-muted-foreground">
              {data.totalOrders} ordens de compra no total
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IndicatorBarChart
          title="Compras por obra"
          data={data.bySite}
          valueFormatter={formatCurrency}
          horizontal
        />
        <IndicatorBarChart
          title="Compras por fornecedor"
          data={data.bySupplier}
          valueFormatter={formatCurrency}
          horizontal
        />
      </div>

      <IndicatorLineChart
        title="Compras por período (últimos 6 meses)"
        data={data.byPeriod}
        valueFormatter={formatCurrency}
      />
    </div>
  );
}
