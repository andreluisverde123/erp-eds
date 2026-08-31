import { KeyRound } from 'lucide-react';
import { Button } from '@repo/ui';

/// Quem está com a senha temporária definida por um admin não passa por
/// NENHUMA rota da API (`PasswordChangeGuard`), então não há Diário a
/// mostrar. A troca acontece no ERP, que já tem a tela — duplicá-la aqui
/// significaria manter dois formulários de senha em dia, e senha é
/// exatamente o lugar onde uma cópia desatualizada custa caro.
export function SenhaTemporariaPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-pending">
        <KeyRound className="size-6 text-pending-foreground" />
      </div>

      <div>
        <h1 className="text-lg font-semibold text-foreground">Troque sua senha primeiro</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sua senha ainda é a temporária gerada por um administrador. Defina uma senha sua no
          sistema principal e volte ao Diário.
        </p>
      </div>

      <Button asChild className="h-12 w-full">
        <a href={erpPasswordUrl()}>Ir para a troca de senha</a>
      </Button>
    </div>
  );
}

function erpPasswordUrl(): string {
  const { protocol, host } = window.location;
  const erpHost = host.startsWith('diario.') ? host.slice('diario.'.length) : host;
  return `${protocol}//${erpHost}/trocar-senha`;
}
