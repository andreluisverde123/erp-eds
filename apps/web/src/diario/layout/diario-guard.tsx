import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from '@/features/auth/context';

import { SemAcessoPage } from '../pages/sem-acesso-page';

/// Permissão que abre o Diário. Espelha o `@RequirePermissions('diario.access')`
/// que está em todos os controllers de `/diario` na API.
///
/// A checagem daqui é CONVENIÊNCIA, não segurança: ela evita que a pessoa
/// veja uma tela montada só para receber 403 em cada requisição. Quem
/// realmente nega é o backend — remover esta linha do bundle no DevTools não
/// dá acesso a nada.
export const DIARIO_PERMISSION = 'diario.access';

export function DiarioGuard() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Carregando o Diário de Obras…</span>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/entrar" replace state={{ from: location }} />;
  }

  // Senha temporária: a API recusa tudo até a troca. No Diário não há tela de
  // troca de senha — ela é do ERP, e mandar um engenheiro de campo trocar
  // senha numa tela de desktop é melhor que deixá-lo bater em 403 em todas.
  if (user?.mustChangePassword) {
    return <Navigate to="/senha-temporaria" replace />;
  }

  if (!user?.permissions.includes(DIARIO_PERMISSION)) {
    return <SemAcessoPage />;
  }

  return <Outlet />;
}
