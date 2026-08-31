import { ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

/// Autenticado, mas sem `diario.access`. Tela própria em vez de redirecionar
/// para o login: mandar de volta ao login quem ACABOU de entrar corretamente
/// produz o pior diagnóstico possível — a pessoa acha que errou a senha e
/// tenta de novo, indefinidamente.
export function SemAcessoPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/entrar', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <ShieldOff className="size-6 text-muted-foreground" />
      </div>

      <div>
        <h1 className="text-lg font-semibold text-foreground">Sem acesso ao Diário</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A conta {user?.email} entrou, mas o perfil dela não tem acesso ao Diário de Obras. Peça a
          um administrador para liberar em Configurações → Perfis.
        </p>
      </div>

      <Button variant="secondary" className="h-12 w-full" onClick={() => void onLogout()}>
        Entrar com outra conta
      </Button>
    </div>
  );
}
