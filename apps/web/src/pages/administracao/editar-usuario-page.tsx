import { ArrowLeft, Users } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, LoadingState } from '@repo/ui';

import { SystemUserForm } from '@/features/administracao/components/system-user-form';
import { useSystemUser } from '@/features/administracao/hooks/use-system-user';
import { useUpdateSystemUser } from '@/features/administracao/hooks/use-system-user-mutations';
import { userToFormValues } from '@/features/administracao/user-form-schema';
import type { SystemUserInput } from '@/features/administracao/types';

const LIST_PATH = '/administracao/usuarios';

export function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useSystemUser(id);
  const updateMutation = useUpdateSystemUser(id ?? '');

  if (!id) {
    return <Navigate to={LIST_PATH} replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Users className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Usuário não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(LIST_PATH)}>
          Voltar para Usuários
        </Button>
      </div>
    );
  }

  if (isLoading || !user) {
    return <LoadingState message="Carregando usuário..." />;
  }

  async function handleSubmit(input: SystemUserInput) {
    await updateMutation.mutateAsync(input);
    navigate(`${LIST_PATH}/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => navigate(`${LIST_PATH}/${id}`)}
        >
          <ArrowLeft />
          Voltar
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Editar {user.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Atualize os dados de acesso e o perfil do usuário.
          </p>
        </div>
      </div>

      <SystemUserForm
        defaultValues={userToFormValues(user)}
        submitLabel="Salvar Alterações"
        submittingLabel="Salvando..."
        onSubmit={handleSubmit}
        onCancel={() => navigate(`${LIST_PATH}/${id}`)}
      />
    </div>
  );
}
