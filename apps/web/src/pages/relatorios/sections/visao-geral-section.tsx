import { ExecutiveSummaryCards } from '@/features/relatorios/components/executive-summary-cards';

export function VisaoGeralSection() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Home Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Visão consolidada da operação para gestores e diretores.
        </p>
      </div>

      <ExecutiveSummaryCards />
    </div>
  );
}
