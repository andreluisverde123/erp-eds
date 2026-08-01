import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { LoadingState, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';

import { VisaoGeralSection } from './sections/visao-geral-section';

// Cada aba (exceto Visão Geral, que já aparece ao abrir a página) carrega
// sob demanda — Recharts e as 5 telas de relatório só entram no bundle
// quando o usuário realmente abre aquela aba.
const IndicadoresSection = lazy(() =>
  import('./sections/indicadores-section').then((m) => ({ default: m.IndicadoresSection })),
);
const ObrasRelatorioSection = lazy(() =>
  import('./sections/obras-relatorio-section').then((m) => ({ default: m.ObrasRelatorioSection })),
);
const ComprasRelatorioSection = lazy(() =>
  import('./sections/compras-relatorio-section').then((m) => ({
    default: m.ComprasRelatorioSection,
  })),
);
const FinanceiroRelatorioSection = lazy(() =>
  import('./sections/financeiro-relatorio-section').then((m) => ({
    default: m.FinanceiroRelatorioSection,
  })),
);
const RhRelatorioSection = lazy(() =>
  import('./sections/rh-relatorio-section').then((m) => ({ default: m.RhRelatorioSection })),
);
const TerceirosRelatorioSection = lazy(() =>
  import('./sections/terceiros-relatorio-section').then((m) => ({
    default: m.TerceirosRelatorioSection,
  })),
);

const TABS = [
  { value: 'visao-geral', label: 'Visão Geral' },
  { value: 'indicadores', label: 'Indicadores' },
  { value: 'obras', label: 'Obras' },
  { value: 'compras', label: 'Compras' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'rh', label: 'RH' },
  { value: 'terceiros', label: 'Terceirizados' },
];

const DEFAULT_TAB = 'visao-geral';

function TabFallback() {
  return <LoadingState />;
}

export function RelatoriosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? DEFAULT_TAB;

  function handleTabChange(value: string) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('tab', value);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Dashboards, indicadores e relatórios executivos.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="visao-geral">
          <VisaoGeralSection />
        </TabsContent>
        <TabsContent value="indicadores">
          <Suspense fallback={<TabFallback />}>
            <IndicadoresSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="obras">
          <Suspense fallback={<TabFallback />}>
            <ObrasRelatorioSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="compras">
          <Suspense fallback={<TabFallback />}>
            <ComprasRelatorioSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="financeiro">
          <Suspense fallback={<TabFallback />}>
            <FinanceiroRelatorioSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="rh">
          <Suspense fallback={<TabFallback />}>
            <RhRelatorioSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="terceiros">
          <Suspense fallback={<TabFallback />}>
            <TerceirosRelatorioSection />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
