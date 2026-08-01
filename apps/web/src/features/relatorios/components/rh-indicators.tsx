import { useRhIndicators } from '../hooks/use-indicators';
import { IndicatorBarChart } from './indicator-bar-chart';
import { IndicatorLineChart } from './indicator-line-chart';

function formatHours(value: number): string {
  return `${value}h`;
}

export function RhIndicators() {
  const { data, isLoading } = useRhIndicators();

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <IndicatorBarChart title="Funcionários por obra" data={data.employeesBySite} horizontal />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IndicatorLineChart title="Produção diária (últimos 30 dias)" data={data.dailyProduction} />
        <IndicatorLineChart
          title="Horas trabalhadas (últimos 30 dias)"
          data={data.hoursWorked}
          valueFormatter={formatHours}
        />
      </div>
    </div>
  );
}
