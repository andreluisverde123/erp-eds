import { lazy, Suspense, useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/features/auth/provider';
import { resolveAppEnvironment } from '@/lib/app-mode';
import { queryClient } from '@/lib/query-client';

// Um bundle, dois ambientes: só o que a aba realmente serve é baixado. Quem
// abre `diario.gestaoeds.com.br` não recebe as rotas do ERP, e vice-versa.
const ErpApp = lazy(() => import('@/erp-app').then((m) => ({ default: m.ErpApp })));
const DiarioApp = lazy(() => import('@/diario/diario-app').then((m) => ({ default: m.DiarioApp })));

function App() {
  // Resolvido uma vez, no primeiro render: o endereço não muda sem recarregar
  // a página.
  const environment = useMemo(() => resolveAppEnvironment(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Um AuthProvider só para os dois ambientes: mesma sessão, mesmo
          refresh silencioso, mesmo access token em memória. É o que faz o
          Diário não ter "uma segunda autenticação". */}
      <AuthProvider>
        {/* Sem fallback visível: o splash do index.html ainda está na tela
            neste instante, e trocá-lo por um spinner diferente seria uma
            piscada a mais na abertura. */}
        <Suspense fallback={null}>
          {environment.mode === 'diario' ? (
            <DiarioApp basename={environment.basename} />
          ) : (
            <ErpApp />
          )}
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
