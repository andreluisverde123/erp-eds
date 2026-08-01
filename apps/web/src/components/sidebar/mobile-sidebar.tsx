import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@repo/ui';

import { useSidebar } from '@/components/sidebar/sidebar-context';
import { SidebarBrand } from '@/components/sidebar/sidebar-brand';
import { SidebarNav } from '@/components/sidebar/sidebar-nav';
import { SidebarFooter } from '@/components/sidebar/sidebar-footer';

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        className="flex w-72 flex-col bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <SheetDescription className="sr-only">
          Navegue entre os módulos do sistema.
        </SheetDescription>
        <SidebarBrand />
        <SidebarNav />
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}
