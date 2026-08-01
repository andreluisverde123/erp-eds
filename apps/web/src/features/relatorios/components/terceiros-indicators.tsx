import { Card, CardContent } from '@repo/ui';

import { useTerceirosIndicators } from '../hooks/use-indicators';
import { IndicatorBarChart } from './indicator-bar-chart';

export function TerceirosIndicators() {
  const { data, isLoading } = useTerceirosIndicators();

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Empresas ativas</span>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {data.activeContractors}{' '}
            <span className="text-base font-normal text-muted-foreground">
              de {data.totalContractors}
            </span>
          </span>
        </CardContent>
      </Card>

      <IndicatorBarChart title="Contratos vigentes x vencendo" data={data.contractsByBadge} />
    </div>
  );
}
