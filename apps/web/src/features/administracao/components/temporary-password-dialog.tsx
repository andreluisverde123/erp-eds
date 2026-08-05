import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@repo/ui';

import type { SystemUserWithTemporaryPassword } from '../types';

/// De onde veio a senha. Muda só o título e uma frase: no reset o admin
/// precisa saber que a senha anterior deixou de valer agora.
type TemporaryPasswordOrigin = 'created' | 'reset';

interface TemporaryPasswordDialogProps {
  user: SystemUserWithTemporaryPassword | null;
  origin?: TemporaryPasswordOrigin;
  onDone: () => void;
}

const TITLES: Record<TemporaryPasswordOrigin, string> = {
  created: 'Usuário criado',
  reset: 'Nova senha temporária gerada',
};

/// A senha temporária nunca é pedida a um humano: a API gera, guarda só o hash
/// e devolve o texto puro uma única vez. Ela aparece aqui, para o admin
/// repassar por um canal seguro, e não é exibida de novo em lugar nenhum — o
/// usuário é obrigado a trocá-la no primeiro acesso.
export function TemporaryPasswordDialog({
  user,
  origin = 'created',
  onDone,
}: TemporaryPasswordDialogProps) {
  return (
    <AlertDialog open={Boolean(user)} onOpenChange={(open) => !open && onDone()}>
      <AlertDialogContent>
        {/* Remonta a cada usuário (ou ao fechar) pra zerar o estado interno
            sem precisar de um useEffect — mesmo padrão dos demais diálogos. */}
        <TemporaryPasswordDialogBody
          key={user?.temporaryPassword ?? 'closed'}
          user={user}
          origin={origin}
          onDone={onDone}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TemporaryPasswordDialogBody({ user, origin, onDone }: TemporaryPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!user) return;
    await navigator.clipboard.writeText(user.temporaryPassword);
    setCopied(true);
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{TITLES[origin ?? 'created']}</AlertDialogTitle>
        <AlertDialogDescription>
          Repasse esta senha temporária a {user?.name} por um canal seguro — ela não será exibida
          novamente e precisa ser trocada no primeiro acesso.
          {origin === 'reset' && ' A senha anterior deixou de funcionar.'}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
        <code className="flex-1 font-mono text-sm text-foreground">{user?.temporaryPassword}</code>
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
