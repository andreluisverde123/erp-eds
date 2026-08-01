import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './context';

export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
