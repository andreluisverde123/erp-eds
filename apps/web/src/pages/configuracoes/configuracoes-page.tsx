import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { LoadingState, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';

// Cada aba carrega sob demanda (mesmo padrão de apps/web/src/pages/relatorios/relatorios-page.tsx).
const AuditoriaSection = lazy(() =>
  import('./sections/auditoria-section').then((m) => ({ default: m.AuditoriaSection })),
);
const EmpresaSection = lazy(() =>
  import('./sections/empresa-section').then((m) => ({ default: m.EmpresaSection })),
);
const NotificacoesSection = lazy(() =>
  import('./sections/notificacoes-section').then((m) => ({ default: m.NotificacoesSection })),
);
const LixeiraSection = lazy(() =>
  import('./sections/lixeira-section').then((m) => ({ default: m.LixeiraSection })),
);
const PerfisSection = lazy(() =>
  import('./sections/perfis-section').then((m) => ({ default: m.PerfisSection })),
);
const PermissoesSection = lazy(() =>
  import('./sections/permissoes-section').then((m) => ({ default: m.PermissoesSection })),
);
const SistemaSection = lazy(() =>
  import('./sections/sistema-section').then((m) => ({ default: m.SistemaSection })),
);
const UsuariosSection = lazy(() =>
  import('./sections/usuarios-section').then((m) => ({ default: m.UsuariosSection })),
);

const TABS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'usuarios', label: 'Usuários' },
  { value: 'perfis', label: 'Perfis' },
  { value: 'permissoes', label: 'Permissões' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'notificacoes', label: 'Notificações' },
  { value: 'auditoria', label: 'Auditoria' },
  { value: 'lixeira', label: 'Lixeira' },
];

const DEFAULT_TAB = 'empresa';

function TabFallback() {
  return <LoadingState />;
}

export function ConfiguracoesPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Parâmetros administrativos do ERP, visíveis só a Administradores.
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

        <TabsContent value="empresa">
          <Suspense fallback={<TabFallback />}>
            <EmpresaSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="usuarios">
          <Suspense fallback={<TabFallback />}>
            <UsuariosSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="perfis">
          <Suspense fallback={<TabFallback />}>
            <PerfisSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="permissoes">
          <Suspense fallback={<TabFallback />}>
            <PermissoesSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="sistema">
          <Suspense fallback={<TabFallback />}>
            <SistemaSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="notificacoes">
          <Suspense fallback={<TabFallback />}>
            <NotificacoesSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="lixeira">
          <Suspense fallback={<TabFallback />}>
            <LixeiraSection />
          </Suspense>
        </TabsContent>
        <TabsContent value="auditoria">
          <Suspense fallback={<TabFallback />}>
            <AuditoriaSection />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
