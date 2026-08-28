import { useState } from 'react';
import { PanelLeft, Search } from 'lucide-react';
import { Button, useIsMobile } from '@repo/ui';

import { useSidebar } from '@/components/sidebar/sidebar-context';
import { PageHeading } from '@/components/layout/page-heading';
import { GlobalSearch } from '@/components/layout/global-search';
import { CommandPalette } from '@/components/layout/command-palette';
import { HeaderCta } from '@/components/layout/header-cta';
import { UserMenu } from '@/components/layout/user-menu';

export function SiteHeader() {
  const { toggleCollapsed, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-5 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => (isMobile ? setMobileOpen(true) : toggleCollapsed())}
        >
          <PanelLeft className="size-[18px]" strokeWidth={1.75} />
          <span className="sr-only">Alternar menu lateral</span>
        </Button>

        <PageHeading />
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        {isMobile ? (
          // No celular não cabe o campo de busca inteiro nem o CTA — a lupa
          // abre a CommandPalette, que serve os mesmos dados do GlobalSearch.
          // Sem ela o mobile ficaria sem nenhuma forma de buscar, porque o
          // atalho Cmd/Ctrl+K não existe em tela de toque. O CTA contextual
          // migra pro topo do menu lateral (ver MobileSidebar).
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setPaletteOpen(true)}
          >
            <Search className="size-[18px]" strokeWidth={1.75} />
            <span className="sr-only">Buscar</span>
          </Button>
        ) : (
          <>
            <GlobalSearch />
            <HeaderCta />
          </>
        )}
        <UserMenu />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
