import { ErrorState, TableSkeleton } from '@repo/ui';

import { NotificationPreferencesTable } from '@/features/configuracoes/components/notification-preferences-table';
import { useNotificationPreferences } from '@/features/configuracoes/hooks/use-notification-preferences';

export function NotificacoesSection() {
  const { data: preferences, isLoading, isError } = useNotificationPreferences();

  if (isError) {
    return (
      <ErrorState message="Não foi possível carregar as preferências de notificação. Tente novamente." />
    );
  }

  if (isLoading || !preferences) {
    return <TableSkeleton columns={6} message="Carregando preferências..." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Notificações</h2>
        <p className="text-sm text-muted-foreground">
          Escolha por quais canais cada evento notifica. WhatsApp e Push estão preparados na
          estrutura, mas ainda sem integração ativa.
        </p>
      </div>

      <NotificationPreferencesTable preferences={preferences} />
    </div>
  );
}
