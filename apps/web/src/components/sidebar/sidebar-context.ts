import { createContext, useContext } from 'react';

export interface SidebarContextValue {
  /** Sidebar colapsada para o modo somente-ícones (desktop). */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Drawer da sidebar aberto (mobile). */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error('useSidebar deve ser usado dentro de um SidebarProvider');
  }

  return context;
}
