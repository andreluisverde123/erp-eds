import { useQuery } from '@tanstack/react-query';
import { LogOut, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar, AvatarFallback, Button, Skeleton } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

import { listSites } from '../api';
import { initialsOf } from '../components/initials';
import { ASSIGNMENT_ROLE_LABEL } from '../components/site-status';

export function DiarioPerfilPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, isPending } = useQuery({ queryKey: ['diario', 'obras'], queryFn: listSites });

  async function onLogout() {
    await logout();
    navigate('/entrar', { replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="flex items-center gap-3">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
            {user ? initialsOf(user.name) : '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{user?.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <dl className="mt-5 rounded-xl border border-border bg-background px-4">
        <div className="border-b border-border py-3">
          <dt className="text-xs text-muted-foreground">Perfil de acesso</dt>
          <dd className="mt-0.5 text-sm text-foreground">{user?.roles.join(', ') || '—'}</dd>
        </div>
        <div className="py-3">
          <dt className="text-xs text-muted-foreground">Obras vinculadas</dt>
          <dd className="mt-1 text-sm text-foreground">
            {isPending ? (
              <Skeleton className="h-5 w-32" />
            ) : data && data.length > 0 ? (
              <ul className="space-y-1">
                {data.map((site) => (
                  <li key={site.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{site.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ASSIGNMENT_ROLE_LABEL[site.assignmentRole]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Nenhuma</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Ponte para o ERP: quem tem acesso aos dois abre o sistema completo
          sem precisar lembrar o outro endereço. Link absoluto de propósito —
          é a única navegação do Diário que sai do subdomínio. */}
      <Button asChild variant="secondary" className="mt-4 h-12 w-full justify-start text-base">
        <a href={erpUrl()}>
          <Monitor className="size-5" />
          Abrir o ERP completo
        </a>
      </Button>

      <Button
        variant="secondary"
        className="mt-2 h-12 w-full justify-start text-base text-destructive"
        onClick={() => void onLogout()}
      >
        <LogOut className="size-5" />
        Sair
      </Button>
    </div>
  );
}

/// Endereço do ERP a partir do endereço do Diário. Derivado em tempo de
/// execução, e não cravado no bundle: a mesma imagem serve túnel temporário,
/// staging e produção.
///
/// Pelo subdomínio, o ERP é o mesmo host sem o prefixo `diario.`. Pela rota de
/// escape (`/diario`), é a raiz do host atual.
function erpUrl(): string {
  const { protocol, host } = window.location;
  return host.startsWith('diario.') ? `${protocol}//${host.slice('diario.'.length)}/` : '/';
}
