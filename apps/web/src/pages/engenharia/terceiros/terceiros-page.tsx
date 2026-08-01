import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { LoadingState, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';

// Cada aba carrega sob demanda (mesmo padrão de apps/web/src/pages/relatorios/relatorios-page.tsx).
const ContratosSection = lazy(() =>
  import('./sections/contratos-section').then((m) => ({ default: m.ContratosSection })),
);
const DocumentacaoSection = lazy(() =>
  import('./sections/documentacao-section').then((m) => ({ default: m.DocumentacaoSection })),
);
const EmpresasSection = lazy(() =>
  import('./sections/empresas-section').then((m) => ({ default: m.EmpresasSection })),
);
const FuncionariosSection = lazy(() =>
  import('./sections/funcionarios-section').then((m) => ({ default: m.FuncionariosSection })),
);

const TABS = [
  { value: 'empresas', label: 'Empresas' },
  { value: 'contratos', label: 'Contratos' },
  { value: 'funcionarios', label: 'Funcionários' },
  { value: 'documentacao', label: 'Documentação' },
];

const DEFAULT_TAB = 'empresas';

function TabFallback() {
  return <LoadingState />;
}

export function TerceirosPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Terceirizados</h1>
        <p className="text-sm text-muted-foreground">
          Empresas terceirizadas, contratos, equipes e documentação.
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

        <TabsContent value="empresas">
          <Suspense fallback={<TabFallback />}>
            <EmpresasSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="contratos">
          <Suspense fallback={<TabFallback />}>
            <ContratosSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="funcionarios">
          <Suspense fallback={<TabFallback />}>
            <FuncionariosSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="documentacao">
          <Suspense fallback={<TabFallback />}>
            <DocumentacaoSection />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
