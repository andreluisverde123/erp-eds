import { NavLink } from 'react-router';
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@repo/ui';

import type { NavLink as NavLinkType } from '@/config/nav';

export function SidebarNavLink({ item, collapsed }: { item: NavLinkType; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        cn(
          // Largura sempre igual à linha da sidebar — hug-content só na
          // altura (via padding), nunca na largura.
          'group flex items-center gap-2 rounded-[5px] p-2.5 text-xs font-medium text-sidebar-foreground/70 transition-colors',
          // O hover só se aplica quando o item NÃO é o ativo — assim o fundo
          // sólido (bg-sidebar-accent) fica exclusivo do item selecionado, e
          // o hover usa um destaque mais sutil, evitando que os dois estados
          // fiquem visualmente quase idênticos (só a espessura da fonte
          // diferenciando).
          !isActive && 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          collapsed && 'justify-center px-0',
          isActive && 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground',
        )
      }
    >
      <item.icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.title}</span>
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}
