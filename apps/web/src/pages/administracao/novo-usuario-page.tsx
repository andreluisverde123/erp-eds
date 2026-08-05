import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@repo/ui';

import { SystemUserForm } from '@/features/administracao/components/system-user-form';
import { TemporaryPasswordDialog } from '@/features/administracao/components/temporary-password-dialog';
import { useCreateSystemUser } from '@/features/administracao/hooks/use-system-user-mutations';
import { USER_FORM_DEFAULTS } from '@/features/administracao/user-form-schema';
import type {
  SystemUserInput,
  SystemUserWithTemporaryPassword,
} from '@/features/administracao/types';

const LIST_PATH = '/administracao/usuarios';

export function NovoUsuarioPage() {
  const navigate = useNavigate();
  const createMutation = useCreateSystemUser();
  const [createdUser, setCreatedUser] = useState<SystemUserWithTemporaryPassword | null>(null);

  async function handleSubmit(input: SystemUserInput) {
    // A senha temporária vem só nesta resposta: o diálogo abre antes de sair
    // da tela para o admin conseguir copiá-la.
    setCreatedUser(await createMutation.mutateAsync(input));
  }

  function handleDialogDone() {
    navigate(createdUser ? `${LIST_PATH}/${createdUser.id}` : LIST_PATH);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => navigate(LIST_PATH)}
        >
          <ArrowLeft />
          Voltar
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novo Usuário</h1>
          <p className="text-sm text-muted-foreground">
            Informe os dados de acesso. A senha inicial é gerada pelo sistema.
          </p>
        </div>
      </div>

      <SystemUserForm
        defaultValues={USER_FORM_DEFAULTS}
        submitLabel="Criar Usuário"
        submittingLabel="Criando..."
        onSubmit={handleSubmit}
        onCancel={() => navigate(LIST_PATH)}
      />

      <TemporaryPasswordDialog user={createdUser} onDone={handleDialogDone} />
    </div>
  );
}
