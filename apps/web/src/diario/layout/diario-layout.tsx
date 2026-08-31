import { Building2, ClipboardList, Home, Plus, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { cn } from '@repo/ui';

import { DiarioHeader } from './diario-header';

const NAV_ITEMS = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/obras', label: 'Obras', icon: Building2, end: false },
  { to: '/relatorios', label: 'Relatórios', icon: ClipboardList, end: false },
  { to: '/perfil', label: 'Perfil', icon: UserRound, end: false },
];

/// Casca do Diário: cabeçalho fixo, conteúdo rolável e navegação inferior.
///
/// A navegação é INFERIOR e não lateral porque o aparelho é segurado com uma
/// mão e o polegar não alcança o topo de uma tela de 6". Quatro itens, e não
/// os quinze da sidebar do ERP: o Diário é uma ferramenta operacional, e cada
/// item a mais é um alvo de toque menor.
///
/// O botão de criar relatório fica NO MEIO da barra, elevado. É a ação que a
/// pessoa vem fazer — vale a posição mais alcançável da tela inteira.
export function DiarioLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <DiarioHeader />

      {/* O padding inferior reserva a altura da barra + a área segura do
          aparelho (a faixa do gesto de home no iPhone). Sem ele o último
          cartão da lista fica permanentemente atrás da navegação. */}
      <main className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <li className="relative flex w-16 shrink-0 justify-center">
            <NavLink
              to="/relatorios/novo"
              aria-label="Criar relatório"
              className={cn(
                'absolute -top-5 flex size-14 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-lg shadow-primary/25',
                'transition-transform active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                location.pathname.startsWith('/relatorios/novo') &&
                  'ring-2 ring-ring ring-offset-2',
              )}
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </NavLink>
          </li>

          {NAV_ITEMS.slice(2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end: boolean;
}) {
  return (
    <li className="flex-1">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            // 64px de altura: acima dos 44px mínimos de alvo de toque, com
            // folga para um dedo em luva de obra.
            'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
            'transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} />
            {label}
          </>
        )}
      </NavLink>
    </li>
  );
}
