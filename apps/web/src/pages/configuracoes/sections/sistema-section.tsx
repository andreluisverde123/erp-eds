import { ErrorState, LoadingState } from '@repo/ui';

import { SystemSettingsForm } from '@/features/configuracoes/components/system-settings-form';
import { useSystemSettings } from '@/features/configuracoes/hooks/use-system-settings';

export function SistemaSection() {
  const { data: settings, isLoading, isError } = useSystemSettings();

  if (isError) {
    return (
      <ErrorState message="Não foi possível carregar as configurações do sistema. Tente novamente." />
    );
  }

  if (isLoading || !settings) {
    return <LoadingState message="Carregando configurações..." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Sistema</h2>
        <p className="text-sm text-muted-foreground">
          Parâmetros gerais que afetam o comportamento do ERP.
        </p>
      </div>

      <SystemSettingsForm settings={settings} />
    </div>
  );
}
