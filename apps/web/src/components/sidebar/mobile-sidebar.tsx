import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@repo/ui';

import { useSidebar } from '@/components/sidebar/sidebar-context';
import { HeaderCta } from '@/components/layout/header-cta';
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

        {/* A ação primária do perfil, que no desktop fica no header. O `empty:hidden`
            cobre o caso de o usuário não ter permissão pra nenhum CTA: aí o HeaderCta
            devolve null, a div fica vazia e some junto com o próprio espaçamento. */}
        <div className="px-3 pb-2 empty:hidden">
          <HeaderCta className="h-9 w-full" />
        </div>

        <SidebarNav />
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}
