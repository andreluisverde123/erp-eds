import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { CompanyLogo } from '@/components/company-logo';

import { useAuth } from './context';

export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  // Continuação do splash do index.html: aquele cobre até o React montar, este
  // cobre a validação da sessão contra a API. A mesma marca nos dois evita a
  // troca de tela no meio da abertura do sistema.
  if (status === 'loading') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
        <CompanyLogo className="h-8 w-auto max-w-none" />
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Senha definida por um admin: a API bloqueia todas as rotas até a troca
  // (PasswordChangeGuard), então mandar o usuário para qualquer outra tela só
  // renderia uma sequência de 403.
  if (user?.mustChangePassword && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }

  return <Outlet />;
}
