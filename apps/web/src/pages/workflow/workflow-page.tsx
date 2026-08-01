import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { LoadingState, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';

import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';

// Cada aba carrega sob demanda (mesmo padrão de apps/web/src/pages/relatorios/relatorios-page.tsx).
const ComprasWorkflowSection = lazy(() =>
  import('./sections/compras-workflow-section').then((m) => ({
    default: m.ComprasWorkflowSection,
  })),
);
const FinanceiroWorkflowSection = lazy(() =>
  import('./sections/financeiro-workflow-section').then((m) => ({
    default: m.FinanceiroWorkflowSection,
  })),
);
const RhWorkflowSection = lazy(() =>
  import('./sections/rh-workflow-section').then((m) => ({ default: m.RhWorkflowSection })),
);

const DEFAULT_TAB = 'compras';

function TabFallback() {
  return <LoadingState />;
}

export function WorkflowPage() {
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
      <BreadcrumbNav />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Processos</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe cada solicitação, nota e funcionário como um fluxo de etapas — status,
          responsável, histórico, comentários e anexos num só lugar.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="rh">RH</TabsTrigger>
        </TabsList>

        <TabsContent value="compras">
          <Suspense fallback={<TabFallback />}>
            <ComprasWorkflowSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="financeiro">
          <Suspense fallback={<TabFallback />}>
            <FinanceiroWorkflowSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="rh">
          <Suspense fallback={<TabFallback />}>
            <RhWorkflowSection />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
