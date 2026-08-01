import { useEngenhariaIndicators } from '../hooks/use-indicators';
import { IndicatorBarChart } from './indicator-bar-chart';
import { ProgressListCard } from './progress-list-card';

export function EngenhariaIndicators() {
  const { data, isLoading } = useEngenhariaIndicators();

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
        <IndicatorBarChart title="Obras por status" data={data.sitesByStatus} />
        <IndicatorBarChart
          title="Centros de custo mais utilizados"
          data={data.topCostCenters}
          horizontal
        />
      </div>

      <ProgressListCard
        title="Evolução das obras em andamento (estimativa por cronograma)"
        data={data.sitesProgress}
      />
    </div>
  );
}
