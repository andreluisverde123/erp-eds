import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { cn } from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { useBrand } from '@/features/auth/use-brand';
import { CompanyMarkLogo } from '@/features/auth/components/company-mark-logo';

export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { logout } = useAuth();
  const { companyName } = useBrand();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border px-3 py-2.5">
      {/* Identidade da construtora. O nome vem da configuração central da EDS
          e é sobreposto pelo que a própria empresa gravar em Configurações →
          Empresa; nunca fica vazio, porque a empresa é única e conhecida antes
          mesmo de existir sessão. */}
      {!collapsed && (
        <div className="flex items-center gap-2.5 rounded-[4px] border border-sidebar-border bg-white px-3 py-1.5">
          <CompanyMarkLogo className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[10px] text-[#9d9d9d]">Construtora</span>
            <span className="truncate text-xs font-medium text-sidebar-foreground">
              {companyName}
            </span>
          </div>
          <ChevronsUpDown
            className="size-3 shrink-0 text-sidebar-foreground/50"
            strokeWidth={1.75}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className={cn(
          'flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          collapsed && 'justify-center px-0',
        )}
      >
        <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
        <span className={cn('truncate', collapsed && 'sr-only')}>Sair</span>
      </button>
    </div>
  );
}
