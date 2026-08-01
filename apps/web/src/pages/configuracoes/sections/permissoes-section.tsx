import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingState } from '@repo/ui';

import { usePermissions } from '@/features/configuracoes/hooks/use-permissions';
import { getModuleLabel } from '@/features/configuracoes/permission-modules';

export function PermissoesSection() {
  const { data: permissions, isLoading, isError } = usePermissions();

  if (isError) {
    return <ErrorState message="Não foi possível carregar as permissões. Tente novamente." />;
  }

  if (isLoading || !permissions) {
    return <LoadingState message="Carregando permissões..." />;
  }

  const grouped = permissions.reduce<Record<string, typeof permissions>>((groups, permission) => {
    (groups[permission.module] ??= []).push(permission);
    return groups;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Permissões</h2>
        <p className="text-sm text-muted-foreground">
          Catálogo de permissões do sistema, agrupadas por módulo. Para atribuí-las a um perfil, use
          a aba Perfis.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Object.entries(grouped).map(([module, modulePermissions]) => (
          <Card key={module}>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                {getModuleLabel(module)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {modulePermissions.map((permission) => (
                <div key={permission.code} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-foreground">
                    {permission.description ?? permission.code}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
