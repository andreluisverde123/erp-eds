import { ComprasIndicators } from '@/features/relatorios/components/compras-indicators';
import { EngenhariaIndicators } from '@/features/relatorios/components/engenharia-indicators';
import { FinanceiroIndicators } from '@/features/relatorios/components/financeiro-indicators';
import { RhIndicators } from '@/features/relatorios/components/rh-indicators';
import { TerceirosIndicators } from '@/features/relatorios/components/terceiros-indicators';

function IndicatorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function IndicadoresSection() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Indicadores</h2>
        <p className="text-sm text-muted-foreground">Indicadores gerenciais por módulo.</p>
      </div>

      <IndicatorGroup title="Compras">
        <ComprasIndicators />
      </IndicatorGroup>

      <IndicatorGroup title="Financeiro">
        <FinanceiroIndicators />
      </IndicatorGroup>

      <IndicatorGroup title="Engenharia">
        <EngenhariaIndicators />
      </IndicatorGroup>

      <IndicatorGroup title="RH">
        <RhIndicators />
      </IndicatorGroup>

      <IndicatorGroup title="Terceirizados">
        <TerceirosIndicators />
      </IndicatorGroup>
    </div>
  );
}
