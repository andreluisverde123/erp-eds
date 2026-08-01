import { cn } from '@repo/ui';

import { useSidebar } from '@/components/sidebar/sidebar-context';
import { SidebarBrand } from '@/components/sidebar/sidebar-brand';
import { SidebarNav } from '@/components/sidebar/sidebar-nav';
import { SidebarFooter } from '@/components/sidebar/sidebar-footer';

export function AppSidebar() {
  const { collapsed } = useSidebar();

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-linear md:flex',
        collapsed ? 'w-[68px]' : 'w-[234px]',
      )}
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
