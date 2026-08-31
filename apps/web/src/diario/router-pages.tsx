import { lazy, Suspense, type ReactNode } from 'react';
import { LoadingState } from '@repo/ui';

// Mesmo carregamento sob demanda do ERP (ver `src/router-pages.tsx`). Aqui ele
// pesa mais: o Diário abre no 4G do canteiro, e cada tela que não é a Home é
// bytes que não precisam chegar antes da primeira interação.
export const DiarioHomePage = lazy(() =>
  import('./pages/home-page').then((m) => ({ default: m.DiarioHomePage })),
);
export const DiarioObrasPage = lazy(() =>
  import('./pages/obras-page').then((m) => ({ default: m.DiarioObrasPage })),
);
export const DiarioObraDetailPage = lazy(() =>
  import('./pages/obra-detail-page').then((m) => ({ default: m.DiarioObraDetailPage })),
);
export const DiarioRelatoriosPage = lazy(() =>
  import('./pages/relatorios-page').then((m) => ({ default: m.DiarioRelatoriosPage })),
);
export const DiarioNovoRelatorioPage = lazy(() =>
  import('./pages/novo-relatorio-page').then((m) => ({ default: m.DiarioNovoRelatorioPage })),
);
export const DiarioRdoPage = lazy(() =>
  import('./pages/rdo-page').then((m) => ({ default: m.DiarioRdoPage })),
);
export const DiarioPerfilPage = lazy(() =>
  import('./pages/perfil-page').then((m) => ({ default: m.DiarioPerfilPage })),
);
export const DiarioLoginPage = lazy(() =>
  import('./pages/login-page').then((m) => ({ default: m.DiarioLoginPage })),
);
export const SenhaTemporariaPage = lazy(() =>
  import('./pages/senha-temporaria-page').then((m) => ({ default: m.SenhaTemporariaPage })),
);

/// Fronteira de Suspense por tela. Uma só, no topo, faria a barra de navegação
/// sumir a cada troca de aba enquanto o pedaço novo carrega.
export function Screen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}
