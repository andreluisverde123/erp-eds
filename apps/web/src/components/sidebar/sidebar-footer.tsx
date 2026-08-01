import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { cn } from '@repo/ui';

import { SHOW_TENANT_BADGE } from '@/config/product';
import { useAuth } from '@/features/auth/context';
import { useBrand } from '@/features/auth/use-brand';
import { TenantLogo } from '@/features/auth/components/tenant-logo';

export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { logout } = useAuth();
  const { tenantName } = useBrand();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border px-3 py-2.5">
      {/* Identidade do INQUILINO logado, vinda do banco. Antes o logo e o nome
          de um cliente específico estavam fixos aqui — o produto não pode
          conhecer o nome de nenhum cliente. Numa instalação dedicada o cartão
          é redundante (o logo do topo já é do cliente) e sai por configuração. */}
      {SHOW_TENANT_BADGE && !collapsed && (
        <div className="flex items-center gap-2.5 rounded-[4px] border border-sidebar-border bg-white px-3 py-1.5">
          <TenantLogo className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[10px] text-[#9d9d9d]">Construtora</span>
            <span className="truncate text-xs font-medium text-sidebar-foreground">
              {tenantName ?? '—'}
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
