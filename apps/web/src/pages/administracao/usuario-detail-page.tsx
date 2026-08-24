import { useState } from 'react';
import { ArrowLeft, KeyRound, Pencil, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, Card, CardContent, LoadingState } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { BankAccountsSection } from '@/features/administracao/components/bank-accounts-section';
import { SystemUserStatusBadge } from '@/features/administracao/components/system-user-status-badge';
import { TemporaryPasswordDialog } from '@/features/administracao/components/temporary-password-dialog';
import { useSystemUser } from '@/features/administracao/hooks/use-system-user';
import {
  useResetSystemUserPassword,
  useUpdateSystemUserStatus,
} from '@/features/administracao/hooks/use-system-user-mutations';
import { getUserStatusLabel } from '@/features/administracao/user-status';
import type { SystemUserWithTemporaryPassword } from '@/features/administracao/types';

const LIST_PATH = '/administracao/usuarios';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : 'Nunca acessou';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function UsuarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useSystemUser(id);
  const statusMutation = useUpdateSystemUserStatus();
  const resetPasswordMutation = useResetSystemUserPassword();

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  // Vive só aqui, no estado desta tela: fechar o modal descarta a senha, que
  // não existe em nenhum outro lugar do app.
  const [generatedPassword, setGeneratedPassword] =
    useState<SystemUserWithTemporaryPassword | null>(null);

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

  const userId = user.id;

  async function confirmDeactivate() {
    await statusMutation.mutateAsync({ id: userId, isActive: false });
    setDeactivateDialogOpen(false);
  }

  async function confirmResetPassword() {
    setGeneratedPassword(await resetPasswordMutation.mutateAsync(userId));
    setResetDialogOpen(false);
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

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{user.name}</h1>
              <SystemUserStatusBadge status={user.status} />
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`${LIST_PATH}/${user.id}/editar`)}>
              <Pencil />
              Editar
            </Button>
            <Button
              variant="outline"
              disabled={resetPasswordMutation.isPending}
              onClick={() => setResetDialogOpen(true)}
            >
              <KeyRound />
              Gerar nova senha temporária
            </Button>
            {user.isActive ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDeactivateDialogOpen(true)}
              >
                <UserRoundX />
                Desativar
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: user.id, isActive: true })}
              >
                <UserRoundCheck />
                Ativar
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Nome" value={user.name} />
          <InfoRow label="E-mail" value={user.email} />
          <InfoRow label="Perfil" value={user.roles.map((role) => role.name).join(', ') || '—'} />
          <InfoRow label="Status" value={getUserStatusLabel(user.status)} />
          <InfoRow label="Último acesso" value={formatDateTime(user.lastAccessAt)} />
          <InfoRow label="Criado em" value={formatDate(user.createdAt)} />
          <InfoRow label="Criado por" value={user.createdBy?.name ?? '—'} />
        </CardContent>
      </Card>

      {/* Some por inteiro para quem não tem `dados_bancarios.view` — chegar
          até esta tela (admin.manage_users) não dá acesso ao destino de
          pagamento de ninguém. */}
      <BankAccountsSection userId={user.id} userName={user.name} />

      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="Desativar usuário"
        description={`Tem certeza que deseja desativar "${user.name}"? O usuário perderá acesso ao sistema imediatamente.`}
        confirmLabel="Desativar"
        loadingLabel="Desativando..."
        variant="destructive"
        isLoading={statusMutation.isPending}
        onConfirm={confirmDeactivate}
      />

      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Gerar nova senha temporária"
        description={`A senha atual de "${user.name}" deixará de funcionar e as sessões abertas dele serão encerradas. A nova senha aparece uma única vez, para você repassar.`}
        confirmLabel="Gerar senha"
        loadingLabel="Gerando..."
        isLoading={resetPasswordMutation.isPending}
        onConfirm={confirmResetPassword}
      />

      <TemporaryPasswordDialog
        user={generatedPassword}
        origin="reset"
        onDone={() => setGeneratedPassword(null)}
      />
    </div>
  );
}
