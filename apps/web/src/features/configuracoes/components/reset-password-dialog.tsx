import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useResetUserPassword } from '../hooks/use-user-mutations';
import type { User } from '../types';

interface ResetPasswordDialogProps {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  return (
    <AlertDialog open={Boolean(user)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <AlertDialogContent>
        {/* Remonta a cada usuário (ou ao fechar) pra zerar o estado interno
            sem precisar de um useEffect — mesmo padrão dos drawers de formulário. */}
        <ResetPasswordDialogBody
          key={user?.id ?? 'closed'}
          user={user}
          onDone={() => onOpenChange(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetPasswordDialogBody({ user, onDone }: { user: User | null; onDone: () => void }) {
  const resetMutation = useResetUserPassword();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!user) return;
    setError(null);
    try {
      const result = await resetMutation.mutateAsync(user.id);
      setTemporaryPassword(result.temporaryPassword);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível resetar a senha. Tente novamente.',
      );
    }
  }

  async function handleCopy() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
  }

  if (temporaryPassword) {
    return (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>Senha temporária gerada</AlertDialogTitle>
          <AlertDialogDescription>
            Repasse esta senha a {user?.name} por um canal seguro — ela não será exibida novamente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
          <code className="flex-1 font-mono text-sm text-foreground">{temporaryPassword}</code>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            <span className="sr-only">Copiar</span>
          </Button>
        </div>

        <AlertDialogFooter>
          <Button type="button" onClick={onDone}>
            Concluído
          </Button>
        </AlertDialogFooter>
      </>
    );
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Resetar senha</AlertDialogTitle>
        <AlertDialogDescription>
          {error ??
            `Uma nova senha temporária será gerada para "${user?.name}". A senha atual deixará de funcionar imediatamente.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <Button type="button" disabled={resetMutation.isPending} onClick={handleConfirm}>
          {resetMutation.isPending ? 'Gerando...' : 'Resetar senha'}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
